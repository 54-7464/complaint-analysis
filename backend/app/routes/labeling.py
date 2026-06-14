import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..models.user import User
from ..models.user_config import UserAIConfig
from ..models.project import Project, DataSource, PromptDoc
from ..models.labeling import LabelingJob, Label, DataLabel, LabelingRow
from ..auth import get_current_user, create_access_token
from ..config import settings
from ..services.ai_labeler import build_prompt, call_ai, parse_ai_response
from ..services.excel_handler import parse_excel, write_labeled_excel
from ..services.crypto import decrypt_api_key

router = APIRouter(prefix="/api/labeling", tags=["labeling"])

_pause_events: dict[int, threading.Event] = {}
_lock = threading.Lock()
DEFAULT_CONCURRENCY = 3


class StartLabelingRequest(BaseModel):
    project_id: int
    data_source_id: int
    prompt_doc_id: int
    target_field: str
    concurrency: int = DEFAULT_CONCURRENCY
    override: int = 0  # 传1则自动覆盖旧的暂停/运行中任务


@router.post("/start")
def start_labeling(req: StartLabelingRequest, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == req.project_id, Project.user_id == user.id).first()
    if not project:
        raise HTTPException(404, "项目不存在")

    ds = db.query(DataSource).filter(DataSource.id == req.data_source_id).first()
    if not ds:
        raise HTTPException(404, "数据源不存在")

    prompt_doc = db.query(PromptDoc).filter(PromptDoc.id == req.prompt_doc_id).first()
    if not prompt_doc:
        raise HTTPException(404, "提示词文档不存在")

    cfg = db.query(UserAIConfig).filter(UserAIConfig.user_id == user.id).first()
    if not cfg or not cfg.api_key_encrypted:
        raise HTTPException(400, "请先配置 AI API Key")

    existing = db.query(LabelingJob).filter(
        LabelingJob.project_id == req.project_id,
        LabelingJob.status.in_(["running", "pending", "paused"])
    ).first()
    if existing:
        if req.override:
            _delete_job_data(existing.id, db)
            db.delete(existing)
            db.commit()
        else:
            return {
                "blocked": True,
                "existing_job_id": existing.id,
                "existing_status": existing.status,
                "message": f"该项目已有任务 (#{existing.id})，状态: {existing.status}",
            }

    concurrency = max(1, min(req.concurrency, 10))

    job = LabelingJob(
        project_id=req.project_id,
        data_source_id=req.data_source_id,
        prompt_doc_id=req.prompt_doc_id,
        target_field=req.target_field,
        status="pending",
        model_config_json=json.dumps({
            "base_url": cfg.base_url, "model": cfg.model_name, "concurrency": concurrency
        }),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    parsed = parse_excel(ds.file_path)
    rows = parsed["rows"]
    col_idx = parsed["columns"].index(req.target_field) if req.target_field in parsed["columns"] else 0
    for i, row in enumerate(rows):
        text = row[col_idx] if col_idx < len(row) else ""
        db.add(LabelingRow(labeling_job_id=job.id, row_index=i, original_text=str(text)[:200]))
    db.commit()

    api_key = decrypt_api_key(cfg.api_key_encrypted)

    with _lock:
        _pause_events[job.id] = threading.Event()

    thread = threading.Thread(
        target=_run_labeling_job,
        args=(job.id, ds.file_path, prompt_doc.content_text, req.target_field,
              api_key, cfg.base_url, cfg.model_name, concurrency),
        daemon=True,
    )
    thread.start()

    return {"id": job.id, "status": job.status, "progress": 0.0, "total_rows": len(rows)}


@router.post("/{job_id}/pause")
def pause_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job = _get_my_job(job_id, user.id, db)
    if job.status != "running":
        raise HTTPException(400, "只能暂停运行中的任务")
    with _lock:
        evt = _pause_events.get(job_id)
        if evt:
            evt.set()
    job.status = "paused"
    db.commit()
    return {"ok": True, "status": "paused"}


@router.post("/{job_id}/resume")
def resume_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job = _get_my_job(job_id, user.id, db)
    if job.status != "paused":
        raise HTTPException(400, "只能恢复已暂停的任务")
    with _lock:
        evt = _pause_events.get(job_id)
        if evt:
            evt.clear()
    job.status = "running"
    db.commit()

    cfg = db.query(UserAIConfig).filter(UserAIConfig.user_id == user.id).first()
    api_key = decrypt_api_key(cfg.api_key_encrypted) if cfg else ""
    base_url = cfg.base_url if cfg else "https://api.openai.com/v1"
    model = cfg.model_name if cfg else "gpt-4o"
    mc = json.loads(job.model_config_json) if job.model_config_json else {}
    concurrency = mc.get("concurrency", DEFAULT_CONCURRENCY)

    prompt_doc = db.query(PromptDoc).filter(PromptDoc.id == job.prompt_doc_id).first()
    prompt_text = prompt_doc.content_text if prompt_doc else ""

    thread = threading.Thread(
        target=_run_labeling_job,
        args=(job.id, job.data_source.file_path, prompt_text, job.target_field,
              api_key, base_url, model, concurrency),
        daemon=True,
    )
    thread.start()
    return {"ok": True, "status": "running"}


@router.get("/{job_id}/live")
def live_rows(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _get_my_job(job_id, user.id, db)
    rows = db.query(LabelingRow).filter(
        LabelingRow.labeling_job_id == job_id
    ).order_by(LabelingRow.row_index).all()
    return [{
        "row_index": r.row_index,
        "original_text": r.original_text,
        "labels": json.loads(r.labels_json) if r.labels_json else [],
        "thinking": r.thinking_text,
        "status": r.status,
        "error_msg": r.error_msg,
    } for r in rows]


# ============== 并发批量执行 ==============

def _label_one_row(row_index: int, text: str, prompt_text: str, target_field: str,
                   api_key: str, base_url: str, model: str) -> dict:
    """处理单行，返回 {row_index, labels, thinking, error}"""
    if not text.strip():
        return {"row_index": row_index, "labels": [], "thinking": "（空文本，无需分析）", "error": ""}
    try:
        prompt = build_prompt(text, prompt_text, target_field)
        response = call_ai(prompt, api_key, base_url, model)
        labels, thinking = parse_ai_response(response)
        return {"row_index": row_index, "labels": labels, "thinking": thinking, "error": ""}
    except Exception as e:
        return {"row_index": row_index, "labels": ["ERROR"], "thinking": "", "error": str(e)[:300]}


def _run_labeling_job(job_id: int, excel_path: str, prompt_text: str,
                      target_field: str, api_key: str, base_url: str, model: str,
                      concurrency: int = DEFAULT_CONCURRENCY):
    from ..database import SessionLocal

    parsed = parse_excel(excel_path)
    columns = parsed["columns"]
    rows = parsed["rows"]
    total = len(rows)

    if target_field not in columns:
        db0 = SessionLocal()
        try:
            job = db0.query(LabelingJob).filter(LabelingJob.id == job_id).first()
            if job:
                job.status = "failed"
                job.error_message = f"字段 '{target_field}' 不存在"
                db0.commit()
        finally:
            db0.close()
        return

    col_idx = columns.index(target_field)

    db = SessionLocal()
    try:
        job = db.query(LabelingJob).filter(LabelingJob.id == job_id).first()
        if not job:
            return
        if job.status == "done":
            return
        job.status = "running"
        db.commit()
    finally:
        db.close()

    # 找出待处理的行
    db = SessionLocal()
    try:
        done_rows = set(
            r[0] for r in db.query(LabelingRow.row_index).filter(
                LabelingRow.labeling_job_id == job_id,
                LabelingRow.status == "done"
            ).all()
        )
    finally:
        db.close()

    pending_indices = [i for i in range(total) if i not in done_rows]
    label_results: dict[int, list[str]] = {}
    all_labels_set: set[str] = set()

    executor = ThreadPoolExecutor(max_workers=concurrency)
    futures = {}

    # Submit initial batch
    active_count = 0
    idx = 0
    while idx < len(pending_indices) or active_count > 0:
        # check pause
        with _lock:
            evt = _pause_events.get(job_id)
        if evt and evt.is_set():
            # Cancel pending futures
            for f in list(futures.keys()):
                f.cancel()
            executor.shutdown(wait=False)
            db = SessionLocal()
            try:
                j = db.query(LabelingJob).filter(LabelingJob.id == job_id).first()
                if j:
                    j.status = "paused"
                    db.commit()
            finally:
                db.close()
            return

        # Submit new tasks up to concurrency limit
        while active_count < concurrency and idx < len(pending_indices):
            i = pending_indices[idx]
            text = rows[i][col_idx] if col_idx < len(rows[i]) else ""
            f = executor.submit(_label_one_row, i, text, prompt_text, target_field, api_key, base_url, model)
            futures[f] = i
            active_count += 1
            idx += 1

        # Process completed futures
        done_futures = [f for f in futures if f.done()]
        if not done_futures:
            # Wait for at least one to complete with timeout
            import time
            time.sleep(0.5)
            continue

        for f in done_futures:
            row_i = futures.pop(f)
            active_count -= 1
            try:
                result = f.result(timeout=0)
            except Exception as e2:
                result = {"row_index": row_i, "labels": ["ERROR"], "thinking": "", "error": str(e2)[:300]}

            labels_list = result["labels"]
            thinking = result["thinking"]
            error = result.get("error", "")
            label_results[row_i] = labels_list
            for lbl in labels_list:
                if lbl != "ERROR":
                    all_labels_set.add(lbl)

            # Update DB row
            db = SessionLocal()
            try:
                row_record = db.query(LabelingRow).filter(
                    LabelingRow.labeling_job_id == job_id,
                    LabelingRow.row_index == row_i
                ).first()
                if row_record:
                    row_record.labels_json = json.dumps(labels_list, ensure_ascii=False)
                    row_record.thinking_text = thinking
                    row_record.error_msg = error
                    row_record.status = "done" if not error else "error"
                # Update progress
                job = db.query(LabelingJob).filter(LabelingJob.id == job_id).first()
                if job:
                    done_total = len(label_results) + len(done_rows)
                    job.progress = done_total / total
                db.commit()
            finally:
                db.close()

    executor.shutdown(wait=True)

    # All done — save labels
    db = SessionLocal()
    try:
        label_map: dict[str, int] = {}
        job = db.query(LabelingJob).filter(LabelingJob.id == job_id).first()
        if not job:
            return

        for name in sorted(all_labels_set):
            label_obj = Label(labeling_job_id=job_id, name=name)
            db.add(label_obj)
            db.flush()
            label_map[name] = label_obj.id

        for row_idx, lbls in label_results.items():
            for lbl in lbls:
                if lbl in label_map:
                    db.add(DataLabel(labeling_job_id=job_id, row_index=row_idx, label_id=label_map[lbl]))

        # Write labeled Excel
        user_id = job.project.user_id
        output_dir = os.path.join(settings.UPLOAD_DIR, str(user_id), str(job.project_id), "results")
        output_path = os.path.join(output_dir, f"labeled_{job.id}.xlsx")

        # Collect thinking texts
        row_thinkings: dict[int, str] = {}
        all_row_records = db.query(LabelingRow).filter(LabelingRow.labeling_job_id == job_id).all()
        for rr in all_row_records:
            row_thinkings[rr.row_index] = rr.thinking_text

        rows_with_labels = []
        for i, row_data in enumerate(rows):
            lbls = label_results.get(i, [])
            labels_str = ", ".join(lbls)
            thinking_str = row_thinkings.get(i, "")
            rows_with_labels.append(list(row_data) + [labels_str, thinking_str])

        all_cols = columns + ["AI标签", "AI思考过程"]
        write_labeled_excel(all_cols, rows_with_labels, output_path)

        job.status = "done"
        job.labeled_file_path = output_path
        job.progress = 1.0
        with _lock:
            _pause_events.pop(job_id, None)
        db.commit()
    except Exception as e:
        try:
            job = db.query(LabelingJob).filter(LabelingJob.id == job_id).first()
            if job:
                job.status = "failed"
                job.error_message = str(e)[:500]
                db.commit()
        except Exception:
            pass
        with _lock:
            _pause_events.pop(job_id, None)
    finally:
        db.close()


# ============== 其余接口 ==============

@router.get("/job/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job = _get_my_job(job_id, user.id, db)
    labels = db.query(Label).filter(Label.labeling_job_id == job_id).all()
    total_rows = db.query(LabelingRow).filter(LabelingRow.labeling_job_id == job_id).count()
    done_rows = db.query(LabelingRow).filter(
        LabelingRow.labeling_job_id == job_id, LabelingRow.status == "done"
    ).count()
    return {
        "id": job.id,
        "status": job.status,
        "target_field": job.target_field,
        "progress": job.progress,
        "error_message": job.error_message,
        "labeled_file_path": job.labeled_file_path,
        "data_source_id": job.data_source_id,
        "total_rows": total_rows if total_rows else 0,
        "done_rows": done_rows,
        "labels": [{"id": l.id, "name": l.name} for l in labels],
    }


@router.get("/jobs/{project_id}")
def list_jobs(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user.id).first()
    if not project:
        raise HTTPException(404, "项目不存在")
    jobs = db.query(LabelingJob).filter(LabelingJob.project_id == project_id).order_by(LabelingJob.created_at.desc()).all()
    result = []
    for j in jobs:
        total = db.query(LabelingRow).filter(LabelingRow.labeling_job_id == j.id).count()
        done = db.query(LabelingRow).filter(
            LabelingRow.labeling_job_id == j.id, LabelingRow.status == "done"
        ).count()
        result.append({
            "id": j.id, "status": j.status, "target_field": j.target_field,
            "progress": j.progress, "error_message": j.error_message,
            "labeled_file_path": j.labeled_file_path, "data_source_id": j.data_source_id,
            "total_rows": total, "done_rows": done,
        })
    return result


@router.get("/results/{job_id}")
def get_results(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _get_my_job(job_id, user.id, db)
    rows = db.query(LabelingRow).filter(
        LabelingRow.labeling_job_id == job_id
    ).order_by(LabelingRow.row_index).all()
    return {
        "rows": [{
            "_idx": r.row_index,
            "原始文本": r.original_text,
            "AI标签": r.labels_json if r.labels_json != "[]" else "",
            "AI思考过程": r.thinking_text,
            "状态": r.status,
        } for r in rows],
        "total": len(rows),
    }


@router.get("/download/{job_id}")
def download_labeled(job_id: int, token: str = Query(None),
                     db: Session = Depends(get_db)):
    """下载标注结果。支持 URL 参数 ?token=xxx 方式绕过 JWT header 限制"""
    from jose import JWTError, jwt
    if not token:
        raise HTTPException(401, "需要认证")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError):
        raise HTTPException(401, "token 无效")

    job = db.query(LabelingJob).filter(LabelingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "任务不存在")
    project = db.query(Project).filter(Project.id == job.project_id, Project.user_id == user_id).first()
    if not project:
        raise HTTPException(404, "无权限")
    if not job.labeled_file_path or not os.path.exists(job.labeled_file_path):
        raise HTTPException(404, "标注文件尚未生成")
    return FileResponse(job.labeled_file_path, filename=f"标注结果_{job.id}.xlsx",
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


def _get_my_job(job_id: int, user_id: int, db: Session) -> LabelingJob:
    job = db.query(LabelingJob).filter(LabelingJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "任务不存在")
    project = db.query(Project).filter(Project.id == job.project_id, Project.user_id == user_id).first()
    if not project:
        raise HTTPException(404, "无权限")
    return job


def _delete_job_data(job_id: int, db: Session):
    """清空标注任务的所有关联数据（行结果+标签+标签关联）"""
    db.query(DataLabel).filter(DataLabel.labeling_job_id == job_id).delete()
    db.query(Label).filter(Label.labeling_job_id == job_id).delete()
    db.query(LabelingRow).filter(LabelingRow.labeling_job_id == job_id).delete()
    # 清理暂停信号
    with _lock:
        _pause_events.pop(job_id, None)


@router.delete("/job/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """删除/取消标注任务。暂停或运行中的任务均可删除。"""
    job = _get_my_job(job_id, user.id, db)
    _delete_job_data(job_id, db)
    db.delete(job)
    db.commit()
    return {"ok": True}


@router.post("/job/{job_id}/cancel")
def cancel_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """取消暂停/运行中的标注任务，保留底层数据源。"""
    job = _get_my_job(job_id, user.id, db)
    _delete_job_data(job_id, db)
    db.delete(job)
    db.commit()
    return {"ok": True}
