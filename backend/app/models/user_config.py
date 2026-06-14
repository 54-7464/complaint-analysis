from sqlalchemy import Integer, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class UserAIConfig(Base):
    """Per-user AI API configuration. API key is encrypted at rest."""
    __tablename__ = "user_ai_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    api_key_encrypted: Mapped[str] = mapped_column(String(500), default="")
    base_url: Mapped[str] = mapped_column(String(300), default="https://api.openai.com/v1")
    model_name: Mapped[str] = mapped_column(String(100), default="gpt-4o")
