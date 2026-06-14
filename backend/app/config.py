from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    SECRET_KEY: str = "change-me-in-production-please"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    DATABASE_URL: str = "sqlite:///./data/app.db"
    UPLOAD_DIR: str = str(Path(__file__).parent.parent / "uploads")

    # CORS — 生产环境通过环境变量 CORS_ORIGINS 设置
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,https://complaint-analysis-production.up.railway.app"

    # AI defaults — override via env vars
    AI_API_KEY: str = ""
    AI_BASE_URL: str = "https://api.openai.com/v1"
    AI_MODEL: str = "gpt-4o"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
