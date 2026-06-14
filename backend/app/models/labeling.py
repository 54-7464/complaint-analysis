from datetime import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey, Text, Float, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class LabelingJob(Base):
    __tablename__ = "labeling_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False)
    data_source_id: Mapped[int] = mapped_column(Integer, ForeignKey("data_sources.id"), nullable=False)
    prompt_doc_id: Mapped[int] = mapped_column(Integer, ForeignKey("prompt_docs.id"), nullable=False)
    target_field: Mapped[str] = mapped_column(String(200), nullable=False)
    model_config_json: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, running, paused, done, failed
    labeled_file_path: Mapped[str] = mapped_column(String(500), default="")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="labeling_jobs")
    labels = relationship("Label", back_populates="job", cascade="all, delete-orphan")
    data_labels = relationship("DataLabel", back_populates="job", cascade="all, delete-orphan")
    row_results = relationship("LabelingRow", back_populates="job", cascade="all, delete-orphan")


class Label(Base):
    __tablename__ = "labels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    labeling_job_id: Mapped[int] = mapped_column(Integer, ForeignKey("labeling_jobs.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    job = relationship("LabelingJob", back_populates="labels")


class DataLabel(Base):
    __tablename__ = "data_labels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    labeling_job_id: Mapped[int] = mapped_column(Integer, ForeignKey("labeling_jobs.id"), nullable=False)
    row_index: Mapped[int] = mapped_column(Integer, nullable=False)
    label_id: Mapped[int] = mapped_column(Integer, ForeignKey("labels.id"), nullable=False)

    job = relationship("LabelingJob", back_populates="data_labels")


class LabelingRow(Base):
    """逐行标注结果：存储每行的标签+思考过程"""
    __tablename__ = "labeling_rows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    labeling_job_id: Mapped[int] = mapped_column(Integer, ForeignKey("labeling_jobs.id"), nullable=False, index=True)
    row_index: Mapped[int] = mapped_column(Integer, nullable=False)
    original_text: Mapped[str] = mapped_column(Text, default="")
    labels_json: Mapped[str] = mapped_column(Text, default="[]")       # JSON array of label names
    thinking_text: Mapped[str] = mapped_column(Text, default="")        # AI 思考过程
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, done, error
    error_msg: Mapped[str] = mapped_column(Text, default="")

    job = relationship("LabelingJob", back_populates="row_results")
