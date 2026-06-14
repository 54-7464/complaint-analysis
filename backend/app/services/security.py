"""Security utilities: path validation, input sanitization."""

import os
from pathlib import Path
from fastapi import HTTPException

from ..config import settings


def validate_upload_path(file_path: str) -> str:
    """Ensure file_path is within uploads directory. Raises 403 on path traversal attempt."""
    uploads_root = os.path.realpath(settings.UPLOAD_DIR)
    resolved = os.path.realpath(file_path)
    if not resolved.startswith(uploads_root + os.sep) and resolved != uploads_root:
        raise HTTPException(403, "禁止访问此路径")
    return resolved


def sanitize_filename(filename: str) -> str:
    """Remove path separators and dangerous characters from filenames."""
    return Path(filename).name.replace("\\", "").replace("/", "")
