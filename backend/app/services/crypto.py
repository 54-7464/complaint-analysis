import base64
import os
from cryptography.fernet import Fernet

# In production, set FERNET_KEY env var. For dev, generate one on first run.
_KEY: bytes | None = None


def _get_key() -> bytes:
    global _KEY
    if _KEY:
        return _KEY
    env_key = os.environ.get("FERNET_KEY")
    if env_key:
        _KEY = env_key.encode()
    else:
        # derive a stable key from the secret key (not ideal but usable without extra config)
        from ..config import settings  # noqa
        import hashlib
        _KEY = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return _KEY


def encrypt_api_key(plain: str) -> str:
    f = Fernet(_get_key())
    return f.encrypt(plain.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    if not encrypted:
        return ""
    f = Fernet(_get_key())
    return f.decrypt(encrypted.encode()).decode()
