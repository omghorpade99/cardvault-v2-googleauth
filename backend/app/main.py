from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import CORS_ORIGINS, GEMINI_KEY_ENCRYPTION_KEY, MODEL_NAMES, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
from app.api.ai_routes import router as ai_router
from app.supabase_client import supabase

app = FastAPI(title="CardVault V2 AI API", version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Gemini-Api-Key"],
)
app.include_router(ai_router)

@app.get("/")
def root():
    return {"name": "CardVault V2 AI API", "status": "running", "docs": "/docs"}

@app.get("/health")
def health():
    return {
        "ok": True,
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and supabase),
        "gemini_configured": "user_api_key_required",
        "persistent_key_storage_configured": bool(GEMINI_KEY_ENCRYPTION_KEY),
        "models": MODEL_NAMES,
    }
