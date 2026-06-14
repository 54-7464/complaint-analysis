import json
import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from jose import JWTError, jwt
from ..database import get_db
from ..models.user import User
from ..models.project import Project, DataSource
from ..models.labeling import LabelingJob, Label, DataLabel, LabelingRow
from ..auth import get_current_user
from ..config import settings
from ..services.excel_handler import parse_excel, write_binarized_excel
from ..services.binarizer import binarize_labels
from ..services.spss_engine import (
    VariableDef, FrequencyTable, CrossTabTable,
    frequency, cross_tab, to_structured_output,
    load_data,
)

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


# ═══════════════════════════  请求/响应模型  ═══════════════════════════

class VarDefIn(BaseModel):
    name: str
    column: str
    vtype: str = "categorical"
    children: list[str] = []


class AnalysisRequest(BaseModel):
    job_id: int = 0
    data_source_id: int = 0      # 直接使用上传的已标注 Excel
    row_vars: list[VarDefIn] = []
    col_vars: list[VarDefIn] = []
    layer_vars: list[VarDefIn] = []
    stats: list[str] = ["frequency", "row_pct", "col_pct", "total_pct"]


# ═══════════════════════════  API 端点  ═══════════════════════════

@router.get("/columns/{job_id}")
def get_columns(job_id: int, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    """获取标注结果的所有列名和已打标签列表，供前端构建变量面板"""
    _get_job_for_user(job_id, user.id, db)
    labels = db.query(Label).filter(Label.labeling_job_id == job_id).all()
    label_names = [l.name for l in labels]

    job = db.query(LabelingJob).filter(LabelingJob.id == job_id).first()
    excel_path = job.labeled_file_path if job and job.labeled_file_path else ""
    columns = []
    if excel_path and os.path.exists(excel_path):
        parsed = parse_excel(excel_path)
        columns = parsed["columns"]

    return {
        "columns": columns,
        "label_names": label_names,
        "job_target_field": job.target_field if job else "",
    }


@router.post("/run")
def run_analysis(req: AnalysisRequest, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    """执行 SPSS 风格分析。job_id 或 data_source_id 二选一。"""

    # 模式1: 直接用上传的 Excel
    if req.data_source_id:
        ds = db.query(DataSource).filter(DataSource.id == req.data_source_id).first()
        if not ds:
            raise HTTPException(404, "数据源不存在")
        project = db.query(Project).filter(Project.id == ds.project_id, Project.user_id == user.id).first()
        if not project:
            raise HTTPException(404, "无权限")
        excel_path = ds.file_path
        if not excel_path or not os.path.exists(excel_path):
            raise HTTPException(400, "文件不存在")
        label_names = _parse_labels_from_excel(excel_path)
    else:
        # 模式2: 通过标注任务
        job = _get_job_for_user(req.job_id, user.id, db)
        if job.status != "done":
            raise HTTPException(400, "标注任务未完成")
        excel_path = job.labeled_file_path or job.data_source.file_path
        if not excel_path or not os.path.exists(excel_path):
            raise HTTPException(400, "标注文件不存在")
        labels = db.query(Label).filter(Label.labeling_job_id == job.id).all()
        label_names = [l.name for l in labels]

    parsed = parse_excel(excel_path)
    columns = parsed["columns"]
    label_col_idx = _find_label_column(columns)

    data_rows = []
    for raw_row in parsed["rows"]:
        row = {}
        for j, col in enumerate(columns):
            val = raw_row[j] if j < len(raw_row) else ""
            row[col] = str(val)

        # 解析标签
        label_str = ""
        if label_col_idx is not None and 0 <= label_col_idx < len(raw_row):
            label_str = str(raw_row[label_col_idx]) if raw_row[label_col_idx] else ""
        parsed_labels = set()
        if label_str:
            parsed_labels = set(l.strip() for l in label_str.replace("，", ",").split(",") if l.strip())

        for ln in label_names:
            row[ln] = 1 if ln in parsed_labels else 0
        data_rows.append(row)

    # 转换变量定义
    def to_vardef(v: VarDefIn) -> VariableDef:
        return VariableDef(name=v.name, column=v.column, vtype=v.vtype, children=v.children)

    row_vars = [to_vardef(v) for v in req.row_vars]
    col_vars = [to_vardef(v) for v in req.col_vars]

    total_n = len(data_rows)

    # === 频率分析 — 所有行/列变量合并到一张表 ===
    freq_tables: list[dict] = []
    narratives: list[str] = []

    all_vars = row_vars + col_vars
    if all_vars:
        merged_freq_rows: list[dict] = []
        for var in all_vars:
            ft = frequency(var, data_rows, total_n)
            # 给每行标明所属变量
            for r in ft.rows:
                merged_freq_rows.append({
                    "变量": var.name,
                    "类别": r.label,
                    "频数": r.count,
                    "涉及比例(%)": r.pct,
                })
            narratives.append(ft.narrative)
        freq_tables.append({
            "title": f"频率表（{total_n} 条记录）",
            "total_n": total_n,
            "headers": ["变量", "类别", "频数", "涉及比例(%)"],
            "rows": merged_freq_rows,
        })

    # === 交叉分析 — 所有行×所有列合并到一张表 ===
    cross_tables: list[dict] = []
    if row_vars and col_vars:
        cv_map = {cv.name: cv for cv in col_vars}

        all_col_keys: list[tuple[str, str]] = []
        for cv in col_vars:
            for lvl in _resolve_levels(cv, data_rows):
                all_col_keys.append((cv.name, lvl))

        merged_cross_rows: list[dict] = []
        for rv in row_vars:
            for rl in _resolve_levels(rv, data_rows):
                row_total = _count_for_level(rv, rl, data_rows)
                row_d: dict = {"变量": rv.name, "类别": rl, "行总计": row_total}
                for cv_name, cl in all_col_keys:
                    cv_obj = cv_map[cv_name]
                    obs = _count_cross(rv, rl, cv_obj, cl, data_rows)
                    col_key = f"{cv_name}.{cl}"
                    row_d[f"{col_key}\n(频数)"] = obs
                    if "row_pct" in req.stats:
                        row_d[f"{col_key}\n(行%)"] = round(obs / row_total * 100, 1) if row_total > 0 else 0
                    if "col_pct" in req.stats:
                        col_total = _count_for_level(cv_obj, cl, data_rows)
                        row_d[f"{col_key}\n(列%)"] = round(obs / col_total * 100, 1) if col_total > 0 else 0
                    if "total_pct" in req.stats:
                        row_d[f"{col_key}\n(总%)"] = round(obs / total_n * 100, 1) if total_n > 0 else 0
                merged_cross_rows.append(row_d)

        total_row: dict = {"变量": "列总计", "类别": "", "行总计": total_n}
        for cv_name, cl in all_col_keys:
            cv = cv_map[cv_name]
            ct = _count_for_level(cv, cl, data_rows)
            col_key = f"{cv_name}.{cl}"
            total_row[f"{col_key}\n(频数)"] = ct
            if "row_pct" in req.stats:
                total_row[f"{col_key}\n(行%)"] = ""
            if "col_pct" in req.stats:
                total_row[f"{col_key}\n(列%)"] = round(ct / total_n * 100, 1) if total_n > 0 else 0
            if "total_pct" in req.stats:
                total_row[f"{col_key}\n(总%)"] = round(ct / total_n * 100, 1) if total_n > 0 else 0
        merged_cross_rows.append(total_row)

        headers = ["变量", "类别", "行总计"]
        for cv_name, cl in all_col_keys:
            key = f"{cv_name}.{cl}"
            headers.append(f"{key}\n(频数)")
            if "row_pct" in req.stats:
                headers.append(f"{key}\n(行%)")
            if "col_pct" in req.stats:
                headers.append(f"{key}\n(列%)")
            if "total_pct" in req.stats:
                headers.append(f"{key}\n(总%)")

        chi_square_result = None
        if "chi_square" in req.stats and len(row_vars) == 1 and len(col_vars) == 1:
            try:
                from ..services.spss_engine import cross_tab as spss_cross
                ct = spss_cross(row_vars[0], col_vars[0], data_rows, total_n)
                if ct.chi_square:
                    chi_square_result = {
                        "chi_square": ct.chi_square.chi_square,
                        "df": ct.chi_square.df,
                        "p_value": ct.chi_square.p_value,
                        "cramer_v": ct.chi_square.cramer_v,
                        "significant": ct.chi_square.significant,
                    }
            except: pass

        cross_tables.append({
            "title": f"交叉表（{total_n} 条记录）",
            "n": total_n, "headers": headers, "rows": merged_cross_rows,
            "chi_square": chi_square_result,
        })
        narratives.append(f"交叉分析：{len(row_vars)} 行变量 × {len(col_vars)} 列变量")

    # === 输出 ===
    return {
        "frequency_tables": freq_tables,
        "cross_tables": cross_tables,
        "narratives": narratives,
        "summary": {
            "total_records": total_n,
            "frequency_tables": len(freq_tables),
            "cross_tables": len(cross_tables),
        },
    }


# ═══════════════════════════  辅助函数  ═══════════════════════════

def _find_label_column(columns: list[str]) -> int | None:
    for j, col in enumerate(columns):
        if ("标签" in col.strip() and "思考" not in col.strip()):
            return j
    if len(columns) >= 2:
        return len(columns) - 2
    return None


def _parse_labels_from_excel(file_path: str) -> list[str]:
    parsed = parse_excel(file_path)
    lidx = _find_label_column(parsed["columns"])
    labels = set()
    for row in parsed["rows"]:
        if lidx is not None and lidx < len(row) and row[lidx]:
            for lbl in str(row[lidx]).replace("，", ",").split(","):
                if lbl.strip():
                    labels.add(lbl.strip())
    return sorted(labels)


def _resolve_levels(var: VariableDef, data_rows: list[dict]) -> list[str]:
    if var.children:
        return var.children
    vals = set()
    for r in data_rows:
        v = str(r.get(var.column, "")).strip()
        if v:
            vals.add(v)
    return sorted(vals) if vals else [var.name]


def _count_for_level(var: VariableDef, level: str, data_rows: list[dict]) -> int:
    cnt = 0
    for r in data_rows:
        if var.children:
            if int(float(r.get(level, 0))) == 1:
                cnt += 1
        else:
            if str(r.get(var.column, "")).strip() == level:
                cnt += 1
    return cnt


def _count_cross(rv: VariableDef, rl: str, cv: VariableDef, cl: str, data_rows: list[dict]) -> int:
    cnt = 0
    for r in data_rows:
        if rv.children:
            ri = 1 if int(float(r.get(rl, 0))) == 1 else 0
        else:
            ri = 1 if str(r.get(rv.column, "")).strip() == rl else 0
        if cv.children:
            ci = 1 if int(float(r.get(cl, 0))) == 1 else 0
        else:
            ci = 1 if str(r.get(cv.column, "")).strip() == cl else 0
        if ri and ci:
            cnt += 1
    return cnt


# ═══════════════════  额外端点  ═══════════════════

@router.get("/columns-from-ds/{ds_id}")
def get_columns_from_ds(ds_id: int, db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)):
    """从上传的已标注 Excel 获取列名和标签"""
    ds = db.query(DataSource).filter(DataSource.id == ds_id).first()
    if not ds:
        raise HTTPException(404, "数据源不存在")
    project = db.query(Project).filter(Project.id == ds.project_id, Project.user_id == user.id).first()
    if not project:
        raise HTTPException(404, "无权限")
    if not ds.file_path or not os.path.exists(ds.file_path):
        raise HTTPException(404, "文件不存在")
    parsed = parse_excel(ds.file_path)
    return {
        "columns": parsed["columns"],
        "label_names": _parse_labels_from_excel(ds.file_path),
    }


# ═══════════════════════════  二值化/下载端点  ═══════════════════════════

class BinarizeRequest(BaseModel):
    labeling_job_id: int = 0
    data_source_id: int = 0


@router.post("/binarize")
def binarize(req: BinarizeRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """二值化。支持 job_id 或 data_source_id。"""
    if req.data_source_id:
        ds = db.query(DataSource).filter(DataSource.id == req.data_source_id).first()
        if not ds:
            raise HTTPException(404, "数据源不存在")
        project = db.query(Project).filter(Project.id == ds.project_id, Project.user_id == user.id).first()
        if not project:
            raise HTTPException(404, "无权限")
        excel_path = ds.file_path
        label_names = _parse_labels_from_excel(excel_path)
        output_pref = ds.project_id
    else:
        job = _get_job_for_user(req.labeling_job_id, user.id, db)
        if job.status != "done":
            raise HTTPException(400, "标注任务未完成")
        excel_path = job.labeled_file_path or job.data_source.file_path
        label_names = [l.name for l in db.query(Label).filter(Label.labeling_job_id == job.id).all()]
        output_pref = job.project_id

    parsed = parse_excel(excel_path)
    label_col = _find_label_column(parsed["columns"])
    data_rows = []
    for row in parsed["rows"]:
        obj = {}
        for j, col in enumerate(parsed["columns"]):
            obj[col] = row[j] if j < len(row) else ""
        if label_col is not None:
            obj["AI标签"] = str(row[label_col]) if label_col < len(row) and row[label_col] else ""
        data_rows.append(obj)

    binarized = binarize_labels(data_rows, label_names, "AI标签")
    user_dir = os.path.join(settings.UPLOAD_DIR, str(user.id), str(output_pref), "results")
    os.makedirs(user_dir, exist_ok=True)
    import uuid
    output_path = os.path.join(user_dir, f"binarized_{uuid.uuid4().hex[:8]}.xlsx")
    binarized_cols = list(binarized[0].keys()) if binarized else []
    binarized_rows = [[r.get(c, "") for c in binarized_cols] for r in binarized]
    write_binarized_excel(binarized_cols, binarized_rows, output_path)
    return {"rows": binarized[:100], "columns": binarized_cols, "total": len(binarized),
            "file_path": output_path}


@router.get("/download-binarized")
def download_binarized(token: str = Query(None), path: str = Query(None), db: Session = Depends(get_db)):
    """下载二值化文件。通过 path 参数指定文件路径。"""
    uid = _token_to_uid(token)
    if path and os.path.exists(path):
        return FileResponse(path, filename="二值化结果.xlsx",
                            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    raise HTTPException(404, "文件不存在")


def _token_to_uid(token: str | None) -> int:
    if not token:
        raise HTTPException(401, "需要认证")
    try:
        p = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return int(p.get("sub"))
    except (JWTError, ValueError):
        raise HTTPException(401, "token 无效")


def _get_job_for_user(job_id: int, user_id: int, db: Session) -> LabelingJob:
    job = db.query(LabelingJob).filter(LabelingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "任务不存在")
    project = db.query(Project).filter(Project.id == job.project_id, Project.user_id == user_id).first()
    if not project:
        raise HTTPException(404, "无权限")
    return job
