from __future__ import annotations
import os
from pathlib import Path
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
MODEL_NAMES = list(dict.fromkeys([value for value in [
    os.getenv("GEMINI_MODEL_PRIMARY", "gemini-3.8-flash").strip(),
    os.getenv("GEMINI_MODEL_SECONDARY", "gemini-3.6-flash").strip(),
    os.getenv("GEMINI_MODEL_TERTIARY", "gemini-3.5-flash").strip(),
] if value]))
CORS_ORIGINS = [value.strip() for value in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",") if value.strip()]
STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "business-card-images")
GEMINI_KEY_ENCRYPTION_KEY = os.getenv("GEMINI_KEY_ENCRYPTION_KEY", "").strip()
