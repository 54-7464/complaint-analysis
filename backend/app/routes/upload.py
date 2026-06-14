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
CHUNK_SIZE = 4 * 1024 * 1024  # 4MB chunks for streaming


def _safe_filename(original: str) -> str:
    return f"{uuid.uuid4().hex}{os.path.splitext(original)[1]}"


def _verify_project(project_id: int, user_id: int, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
    if not p:
        raise HTTPException(404, "项目不存在")
    return p


async def _save_upload_stream(file: UploadFile, save_path: str, max_size: int):
    """流式写入文件到磁盘，避免一次加载到内存"""
    total = 0
    with open(save_path, "wb") as f:
        while chunk := await file.read(CHUNK_SIZE):
            total += len(chunk)
            if total > max_size:
                raise HTTPException(400, f"文件不能超过{max_size // (1024*1024)}MB")
            f.write(chunk)


def _get_sheets(file_path: str) -> list[str]:
    try:
        wb = openpyxl.load_workbook(file_path, read_only=True)
        sheets = wb.sheetnames
        wb.close()
        return sheets
    except Exception:
        return []


# ═══════════════  sheet 列表 ═══════════════

@router.get("/sheets")
def list_sheets(file_path: str = Query(...), db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    if not os.path.exists(file_path):
        raise HTTPException(404, "文件不存在")
    sheets = _get_sheets(file_path)
    if not sheets:
        raise HTTPException(400, "无法读取 Excel")
    return {"sheets": sheets}


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

    await _save_upload_stream(file, save_path, 500 * 1024 * 1024)

    parsed = parse_excel(save_path, sheet_name=sheet_name if sheet_name else None)
    sheets = _get_sheets(save_path)

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
        "columns": parsed["columns"], "preview": parsed["rows"][:200],
        "sheets": sheets, "sheet_used": sheet_name or sheets[0] if sheets else "(default)",
    }


@router.post("/select-sheet/{ds_id}")
def select_sheet(ds_id: int, sheet_name: str = Query(...),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ds = db.query(DataSource).filter(DataSource.id == ds_id).first()
    if not ds:
        raise HTTPException(404, "文件不存在")
    _verify_project(ds.project_id, user.id, db)
    parsed = parse_excel(ds.file_path, sheet_name=sheet_name)
    ds.columns_json = json.dumps(parsed["columns"], ensure_ascii=False)
    ds.row_count = parsed["row_count"]
    db.commit()
    return {"id": ds.id, "row_count": ds.row_count, "columns": parsed["columns"],
            "preview": parsed["rows"][:200], "sheet_used": sheet_name}


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

    await _save_upload_stream(file, save_path, 200 * 1024 * 1024)

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
    _verify_project(ds.project_id, user.id, db)
    result = parse_excel(ds.file_path)
    return {"columns": result["columns"], "rows": result["rows"][:100]}


# ═══════════════  上传已标注 Excel ═══════════════

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

    await _save_upload_stream(file, save_path, 500 * 1024 * 1024)

    parsed = parse_excel(save_path, sheet_name=sheet_name if sheet_name else None)
    columns = parsed["columns"]
    sheets = _get_sheets(save_path)

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
        "sheets": sheets, "label_names": sorted(all_labels),
        "preview": parsed["rows"][:200],
    }


# ═══════════════  删除 ═══════════════

@router.delete("/datasource/{ds_id}")
def delete_datasource(ds_id: int, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    ds = db.query(DataSource).filter(DataSource.id == ds_id).first()
    if not ds:
        raise HTTPException(404, "文件不存在")
    _verify_project(ds.project_id, user.id, db)
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


# ═══════════════  列出所有数据源 ═══════════════

@router.get("/all-datasources/{project_id}")
def list_all_datasources(project_id: int, db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    _verify_project(project_id, user.id, db)
    items = db.query(DataSource).filter(DataSource.project_id == project_id) \
        .order_by(DataSource.created_at.desc()).all()
    result = []
    for ds in items:
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
