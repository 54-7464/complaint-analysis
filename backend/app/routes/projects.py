from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.user_config import UserAIConfig
from ..models.project import Project, DataSource, PromptDoc
from ..auth import get_current_user, hash_password
from ..schemas.project import ProjectCreate, ProjectResponse, DataSourceResponse, PromptDocResponse, AIConfigUpdate
from ..services.crypto import encrypt_api_key, decrypt_api_key

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Project).filter(Project.user_id == user.id).order_by(Project.updated_at.desc()).all()


@router.post("", response_model=ProjectResponse)
def create_project(data: ProjectCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = Project(user_id=user.id, name=data.name, description=data.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


# ---------- AI config (必须在 /{project_id} 之前，防止 ai-config 被当作 project_id) ----------

@router.get("/ai-config")
def get_ai_config(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cfg = db.query(UserAIConfig).filter(UserAIConfig.user_id == user.id).first()
    if not cfg:
        return {"base_url": "https://api.openai.com/v1", "model_name": "gpt-4o", "has_key": False}
    return {
        "base_url": cfg.base_url,
        "model_name": cfg.model_name,
        "has_key": bool(cfg.api_key_encrypted),
    }


@router.post("/ai-config")
def set_ai_config(data: AIConfigUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cfg = db.query(UserAIConfig).filter(UserAIConfig.user_id == user.id).first()
    if not cfg:
        cfg = UserAIConfig(user_id=user.id)
        db.add(cfg)
    cfg.base_url = data.base_url
    cfg.model_name = data.model_name
    if data.api_key:
        cfg.api_key_encrypted = encrypt_api_key(data.api_key)
    db.commit()
    return {"ok": True}


# ---------- 项目 CRUD ----------

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    return p


@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.get("/{project_id}/datasources", response_model=list[DataSourceResponse])
def list_datasources(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _verify_project(project_id, user.id, db)
    return db.query(DataSource).filter(DataSource.project_id == project_id).all()


@router.get("/{project_id}/prompts", response_model=list[PromptDocResponse])
def list_prompts(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _verify_project(project_id, user.id, db)
    return db.query(PromptDoc).filter(PromptDoc.project_id == project_id).all()


def _verify_project(project_id: int, user_id: int, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    return p
