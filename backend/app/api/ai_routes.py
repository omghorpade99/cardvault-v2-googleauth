from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException
from app.dependencies import authenticated_user, get_owned_note, require_supabase
from app.schemas.requests import NoteIdsRequest
from app.supabase_client import supabase
from app.services.extraction_service import extract_contact
from app.services.research_service import research_company
from app.services.gemini_service import test_api_key
from app.config import GEMINI_KEY_ENCRYPTION_KEY
from cryptography.fernet import Fernet, InvalidToken

router = APIRouter(prefix="/api/ai", tags=["AI"])

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()



def _fernet() -> Fernet:
    if not GEMINI_KEY_ENCRYPTION_KEY:
        raise HTTPException(status_code=503, detail="Persistent API-key storage is not configured. Set GEMINI_KEY_ENCRYPTION_KEY in backend/.env.")
    try:
        return Fernet(GEMINI_KEY_ENCRYPTION_KEY.encode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="GEMINI_KEY_ENCRYPTION_KEY is invalid. Generate a Fernet key and restart the backend.") from exc

def _get_saved_key(owner_id: str) -> str:
    require_supabase()
    result = supabase.table("user_settings").select("gemini_api_key_encrypted").eq("user_id", owner_id).maybe_single().execute()
    row = result.data or {}
    encrypted = row.get("gemini_api_key_encrypted")
    if not encrypted:
        raise HTTPException(status_code=400, detail="Save your Gemini API key in My Gemini API Key settings before using AI features.")
    try:
        return _fernet().decrypt(encrypted.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise HTTPException(status_code=500, detail="The saved Gemini API key could not be decrypted. Check that the encryption key has not changed.") from exc

@router.get("/key")
def get_key_status(owner_id: str = Depends(authenticated_user)):
    require_supabase()

    result = (
        supabase.table("user_settings")
        .select(
            "gemini_api_key_encrypted,"
            "gemini_key_last4,"
            "gemini_key_updated_at"
        )
        .eq("user_id", owner_id)
        .maybe_single()
        .execute()
    )

    # Handle an empty result safely
    if result is None:
        row = {}
    else:
        row = result.data or {}

    return {
        "configured": bool(row.get("gemini_api_key_encrypted")),
        "last4": row.get("gemini_key_last4"),
        "updated_at": row.get("gemini_key_updated_at"),
    }

@router.put("/key")
def save_key(payload: dict, owner_id: str = Depends(authenticated_user)):
    require_supabase()
    key = str(payload.get("api_key") or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Enter a Gemini API key.")
    if len(key) > 500:
        raise HTTPException(status_code=400, detail="The API key value is too long.")
    # Validate before storing, so a typo does not replace a working key.
    model = test_api_key(key)
    encrypted = _fernet().encrypt(key.encode("utf-8")).decode("utf-8")
    timestamp = now_iso()
    supabase.table("user_settings").upsert({
        "user_id": owner_id, "gemini_api_key_encrypted": encrypted,
        "gemini_key_last4": key[-4:], "gemini_key_updated_at": timestamp,
    }, on_conflict="user_id").execute()
    return {"ok": True, "configured": True, "last4": key[-4:], "model": model, "updated_at": timestamp}

@router.delete("/key")
def delete_key(owner_id: str = Depends(authenticated_user)):
    require_supabase()
    supabase.table("user_settings").delete().eq("user_id", owner_id).execute()
    return {"ok": True, "configured": False}

@router.post("/extract")
def extract(request: NoteIdsRequest, owner_id: str = Depends(authenticated_user)):
    require_supabase()
    gemini_api_key = _get_saved_key(owner_id)
    results, errors = [], []
    for note_id in dict.fromkeys(request.note_ids):
        try:
            note = get_owned_note(note_id, owner_id)
            contact, model = extract_contact(note, gemini_api_key.strip())
            timestamp = now_iso()
            supabase.table("notes").update({
                "extracted_contact": contact,
                "extraction_status": "completed",
                "extraction_model": model,
                "extracted_at": timestamp,
                "updated_at": timestamp,
            }).eq("id", note_id).eq("user_id", owner_id).execute()
            results.append({"note_id": note_id, "status": "completed", "model": model, "extracted_contact": contact})
        except Exception as exc:
            message = exc.detail if isinstance(exc, HTTPException) else str(exc)
            errors.append({"note_id": note_id, "error": str(message)[:700]})
            try:
                supabase.table("notes").update({"extraction_status": "failed", "updated_at": now_iso()}).eq("id", note_id).eq("user_id", owner_id).execute()
            except Exception:
                pass
    return {"results": results, "errors": errors, "requested": len(set(request.note_ids))}

@router.post("/research")
async def research(request: NoteIdsRequest, owner_id: str = Depends(authenticated_user)):
    require_supabase()
    gemini_api_key = _get_saved_key(owner_id)
    results, errors = [], []
    for note_id in dict.fromkeys(request.note_ids):
        try:
            note = get_owned_note(note_id, owner_id)
            report, model, sources = await research_company(note, gemini_api_key.strip())
            timestamp = now_iso()
            supabase.table("notes").update({
                "company_report": report,
                "research_sources": sources,
                "research_status": "completed",
                "research_model": model,
                "researched_at": timestamp,
                "updated_at": timestamp,
            }).eq("id", note_id).eq("user_id", owner_id).execute()
            results.append({"note_id": note_id, "status": "completed", "model": model, "company_report": report, "research_sources": sources})
        except Exception as exc:
            message = exc.detail if isinstance(exc, HTTPException) else str(exc)
            errors.append({"note_id": note_id, "error": str(message)[:700]})
            try:
                supabase.table("notes").update({"research_status": "failed", "updated_at": now_iso()}).eq("id", note_id).eq("user_id", owner_id).execute()
            except Exception:
                pass
    return {"results": results, "errors": errors, "requested": len(set(request.note_ids))}


@router.post("/test-key")
def test_key(owner_id: str = Depends(authenticated_user), gemini_api_key: str | None = Header(default=None, alias="X-Gemini-Api-Key")):
    if not gemini_api_key or not gemini_api_key.strip():
        raise HTTPException(status_code=400, detail="Enter a Gemini API key to test it.")
    model = test_api_key(gemini_api_key.strip())
    return {"ok": True, "model": model}
