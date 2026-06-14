import json
import os
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from jose import JWTError, jwt
from ..database import get_db
from ..models.user import User
from ..models.user_config import UserAIConfig
from ..models.project import Project
from ..models.labeling import LabelingJob, Label
from ..models.report import Report
from ..auth import get_current_user
from ..config import settings
from ..services.excel_handler import parse_excel
from ..services.ai_labeler import call_ai
from ..services.report_gen import extract_template_structure, generate_report_docx
from ..services.crypto import decrypt_api_key

router = APIRouter(prefix="/api/report", tags=["report"])


class GenerateReportRequest(BaseModel):
    project_id: int
    labeling_job_id: int
    template_path: str


@router.post("/upload-template/{project_id}")
async def upload_template(project_id: int, file: UploadFile = File(...),
                          db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user.id).first()
    if not project:
        raise HTTPException(404, "项目不存在")

    ext = os.path.splitext(file.filename or ".docx")[1].lower()
    if ext not in {".docx"}:
        raise HTTPException(400, "仅支持 .docx 文件")

    user_dir = os.path.join(settings.UPLOAD_DIR, str(user.id), str(project_id))
    os.makedirs(user_dir, exist_ok=True)
    import uuid
    safe_name = f"template_{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(user_dir, safe_name)

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    return {"file_path": save_path, "filename": file.filename}


@router.post("/generate")
def generate_report(req: GenerateReportRequest, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == req.project_id, Project.user_id == user.id).first()
    if not project:
        raise HTTPException(404, "项目不存在")

    job = db.query(LabelingJob).filter(LabelingJob.id == req.labeling_job_id).first()
    if not job:
        raise HTTPException(404, "标注任务不存在")

    cfg = db.query(UserAIConfig).filter(UserAIConfig.user_id == user.id).first()
    if not cfg or not cfg.api_key_encrypted:
        raise HTTPException(400, "请先配置 AI API Key")

    api_key = decrypt_api_key(cfg.api_key_encrypted)

    # Extract template structure
    template_structure = extract_template_structure(req.template_path) if os.path.exists(req.template_path) else ""

    # Gather analysis data for the report
    labels = db.query(Label).filter(Label.labeling_job_id == job.id).all()
    label_names = [l.name for l in labels]

    # Read labeled data
    excel_path = job.labeled_file_path or job.data_source.file_path
    parsed = parse_excel(excel_path) if os.path.exists(excel_path) else {"rows": [], "columns": []}

    # Build data summary for AI
    from collections import Counter
    label_counter = Counter()
    for row in parsed["rows"]:
        # last column is labels
        if row:
            labels_str = str(row[-1]) if row[-1] else ""
            for lbl in labels_str.split(","):
                lbl = lbl.strip()
                if lbl:
                    label_counter[lbl] += 1

    summary = f"""数据总量：{parsed['row_count']} 条
标签种类：{len(label_names)} 个
标签分布：
{json.dumps(dict(label_counter), ensure_ascii=False, indent=2)}"""

    # Build prompt for report generation
    prompt = f"""你是一位专业的公共卫生数据分析师。请根据以下分析数据，撰写一份卫生投诉分析报告。

【报告模板结构参考】
{template_structure[:3000]}

【数据分析摘要】
{summary}

【要求】
1. 严格仿照模板的结构框架和语句风格
2. 使用专业、正式的公文体语言
3. 包含主要发现、数据解读和建议
4. 适当使用数据来支撑观点"""

    try:
        ai_response = call_ai(prompt, api_key, cfg.base_url, cfg.model_name)
    except Exception as e:
        ai_response = f"AI 调用失败：{str(e)}\n\n请检查 API Key 和网络配置。"

    # Generate Word report
    user_dir = os.path.join(settings.UPLOAD_DIR, str(user.id), str(req.project_id), "reports")
    os.makedirs(user_dir, exist_ok=True)
    import uuid
    output_path = os.path.join(user_dir, f"report_{uuid.uuid4().hex}.docx")

    if os.path.exists(req.template_path):
        generate_report_docx(req.template_path, summary, ai_response, output_path)
    else:
        # Create from scratch
        from docx import Document
        doc = Document()
        doc.add_heading("卫生投诉分析报告", level=0)
        doc.add_paragraph(ai_response)
        doc.save(output_path)

    report = Report(
        project_id=req.project_id,
        template_path=req.template_path,
        content=ai_response,
        file_path=output_path,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {"id": report.id, "content": ai_response, "file_path": output_path}


@router.get("/download/{report_id}")
def download_report(report_id: int, token: str = Query(None),
                    db: Session = Depends(get_db)):
    if not token:
        raise HTTPException(401, "需要认证")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError):
        raise HTTPException(401, "token 无效")
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "报告不存在")
    project = db.query(Project).filter(Project.id == report.project_id, Project.user_id == user_id).first()
    if not project:
        raise HTTPException(404, "无权限")
    if not report.file_path or not os.path.exists(report.file_path):
        raise HTTPException(404, "报告文件不存在")
    return FileResponse(report.file_path, filename=f"分析报告_{report.id}.docx",
                        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
