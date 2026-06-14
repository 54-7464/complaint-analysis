import json
import os
import uuid
import openpyxl
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Form, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.project import Project, DataSource, PromptDoc
from ..auth import get_current_user
from ..config import settings
from ..services.excel_handler import parse_excel
from ..services.word_parser import parse_word

router = APIRouter(prefix="/api/upload", tags=["upload"])

ALLOWED_EXCEL = {".xlsx", ".xls"}
ALLOWED_WORD = {".docx"}


def _safe_filename(original: str) -> str:
    name, ext = os.path.splitext(original)
    return f"{uuid.uuid4().hex}{ext}"


def _verify_project(project_id: int, user_id: int, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
    if not p:
        raise HTTPException(404, "项目不存在")
    return p


# ═══════════════  sheet 列表 ═══════════════

@router.get("/sheets")
def list_sheets(file_path: str = Query(...), db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    """读取 Excel 文件的所有 sheet 名，用于上传前选择。file_path 为临时保存路径。"""
    if not os.path.exists(file_path):
        raise HTTPException(404, "文件不存在")
    try:
        wb = openpyxl.load_workbook(file_path, read_only=True)
        sheets = wb.sheetnames
        wb.close()
        return {"sheets": sheets}
    except Exception as e:
        raise HTTPException(400, f"无法读取 Excel: {str(e)}")


# ═══════════════  上传 Excel ═══════════════

@router.post("/excel/{project_id}")
async def upload_excel(project_id: int, file: UploadFile = File(...),
                       sheet_name: str = Form(""), db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    ext = os.path.splitext(file.filename or ".xlsx")[1].lower()
    if ext not in ALLOWED_EXCEL:
        raise HTTPException(400, "仅支持 .xlsx / .xls 文件")

    _verify_project(project_id, user.id, db)

    safe_name = _safe_filename(file.filename)
    user_dir = os.path.join(settings.UPLOAD_DIR, str(user.id), str(project_id))
    os.makedirs(user_dir, exist_ok=True)
    save_path = os.path.join(user_dir, safe_name)

    content = await file.read()
    if len(content) > 500 * 1024 * 1024:
        raise HTTPException(400, "文件不能超过500MB")
    with open(save_path, "wb") as f:
        f.write(content)

    parsed = parse_excel(save_path, sheet_name=sheet_name if sheet_name else None)
    ds = DataSource(
        project_id=project_id, filename=file.filename, file_path=save_path,
        row_count=parsed["row_count"],
        columns_json=json.dumps(parsed["columns"], ensure_ascii=False),
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return {
        "id": ds.id, "filename": ds.filename, "row_count": ds.row_count,
        "columns": parsed["columns"], "preview": parsed["rows"][:10],
        "sheet_used": sheet_name or "(default)",
    }


# ═══════════════  上传 Word ═══════════════

@router.post("/word/{project_id}")
async def upload_word(project_id: int, file: UploadFile = File(...),
                      db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ext = os.path.splitext(file.filename or ".docx")[1].lower()
    if ext not in ALLOWED_WORD:
        raise HTTPException(400, "仅支持 .docx 文件")

    _verify_project(project_id, user.id, db)

    safe_name = _safe_filename(file.filename)
    user_dir = os.path.join(settings.UPLOAD_DIR, str(user.id), str(project_id))
    os.makedirs(user_dir, exist_ok=True)
    save_path = os.path.join(user_dir, safe_name)

    content = await file.read()
    if len(content) > 200 * 1024 * 1024:
        raise HTTPException(400, "文件不能超过200MB")
    with open(save_path, "wb") as f:
        f.write(content)

    text = parse_word(save_path)
    doc = PromptDoc(
        project_id=project_id, filename=file.filename, file_path=save_path, content_text=text,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "filename": doc.filename, "content_text": text}


# ═══════════════  预览 ═══════════════

@router.get("/preview-excel/{data_source_id}")
def preview_excel(data_source_id: int, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    ds = db.query(DataSource).filter(DataSource.id == data_source_id).first()
    if not ds:
        raise HTTPException(404, "数据源不存在")
    project = db.query(Project).filter(Project.id == ds.project_id, Project.user_id == user.id).first()
    if not project:
        raise HTTPException(404, "无权限")
    result = parse_excel(ds.file_path)
    return {"columns": result["columns"], "rows": result["rows"][:100]}


# ═══════════════  上传已标注 Excel（子模块独立入口）═══════════════

@router.post("/labeled-excel/{project_id}")
async def upload_labeled_excel(project_id: int, file: UploadFile = File(...),
                               sheet_name: str = Form(""),
                               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ext = os.path.splitext(file.filename or ".xlsx")[1].lower()
    if ext not in ALLOWED_EXCEL:
        raise HTTPException(400, "仅支持 .xlsx / .xls 文件")

    _verify_project(project_id, user.id, db)

    safe_name = _safe_filename(file.filename)
    user_dir = os.path.join(settings.UPLOAD_DIR, str(user.id), str(project_id), "results")
    os.makedirs(user_dir, exist_ok=True)
    save_path = os.path.join(user_dir, safe_name)

    content = await file.read()
    if len(content) > 500 * 1024 * 1024:
        raise HTTPException(400, "文件不能超过500MB")
    with open(save_path, "wb") as f:
        f.write(content)

    parsed = parse_excel(save_path, sheet_name=sheet_name if sheet_name else None)
    columns = parsed["columns"]

    label_col_idx = None
    for j, col in enumerate(columns):
        if ("标签" in col.strip() and "思考" not in col.strip()):
            label_col_idx = j
            break
    if label_col_idx is None and len(columns) >= 2:
        label_col_idx = len(columns) - 2

    all_labels = set()
    for row in parsed["rows"]:
        if label_col_idx is not None and label_col_idx < len(row) and row[label_col_idx]:
            for lbl in str(row[label_col_idx]).replace("，", ",").split(","):
                lbl = lbl.strip()
                if lbl:
                    all_labels.add(lbl)

    ds = DataSource(
        project_id=project_id, filename=file.filename, file_path=save_path,
        row_count=parsed["row_count"],
        columns_json=json.dumps(columns, ensure_ascii=False),
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)

    return {
        "id": ds.id, "filename": ds.filename, "file_path": save_path,
        "row_count": parsed["row_count"], "columns": columns,
        "label_names": sorted(all_labels), "preview": parsed["rows"][:10],
    }


# ═══════════════  删除 ═══════════════

@router.delete("/datasource/{ds_id}")
def delete_datasource(ds_id: int, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    ds = db.query(DataSource).filter(DataSource.id == ds_id).first()
    if not ds:
        raise HTTPException(404, "文件不存在")
    _verify_project(ds.project_id, user.id, db)

    # 删除物理文件
    try:
        if os.path.exists(ds.file_path):
            os.remove(ds.file_path)
    except OSError:
        pass

    db.delete(ds)
    db.commit()
    return {"ok": True}


@router.delete("/prompt/{prompt_id}")
def delete_prompt(prompt_id: int, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    p = db.query(PromptDoc).filter(PromptDoc.id == prompt_id).first()
    if not p:
        raise HTTPException(404, "文件不存在")
    _verify_project(p.project_id, user.id, db)

    try:
        if os.path.exists(p.file_path):
            os.remove(p.file_path)
    except OSError:
        pass

    db.delete(p)
    db.commit()
    return {"ok": True}


# ═══════════════  列出所有数据源（子模块用）═══════════════

@router.get("/all-datasources/{project_id}")
def list_all_datasources(project_id: int, db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    """列出项目下所有数据源，含 results 目录下的已标注文件"""
    _verify_project(project_id, user.id, db)
    items = db.query(DataSource).filter(DataSource.project_id == project_id) \
        .order_by(DataSource.created_at.desc()).all()
    result = []
    for ds in items:
        # 快速判断是否为已标注文件：检查列名中是否有 AI标签
        try:
            parsed_cols = json.loads(ds.columns_json) if ds.columns_json else []
        except (json.JSONDecodeError, TypeError):
            parsed_cols = []
        has_labels = any("标签" in c for c in parsed_cols)
        result.append({
            "id": ds.id, "filename": ds.filename, "row_count": ds.row_count,
            "columns": parsed_cols, "has_labels": has_labels,
            "created_at": ds.created_at.isoformat() if ds.created_at else "",
        })
    return result
