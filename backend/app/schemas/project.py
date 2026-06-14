from pydantic import BaseModel
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DataSourceResponse(BaseModel):
    id: int
    project_id: int
    filename: str
    row_count: int
    columns_json: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PromptDocResponse(BaseModel):
    id: int
    project_id: int
    filename: str
    content_text: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AIConfigUpdate(BaseModel):
    model_config = {"protected_namespaces": ()}

    api_key: str
    base_url: str = "https://api.openai.com/v1"
    model_name: str = "gpt-4o"
