from typing import Any
from fastapi import Header, HTTPException
from app.supabase_client import supabase
from app.config import STORAGE_BUCKET, SUPABASE_URL


def require_supabase() -> None:
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase backend is not configured.")


def authenticated_user(authorization: str | None = Header(default=None)) -> str:
    require_supabase()
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="A valid Supabase session is required.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        result = supabase.auth.get_user(token)
        if not result.user:
            raise ValueError("No user returned")
        return str(result.user.id)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Session could not be verified. Please sign in again.") from exc


def get_owned_note(note_id: str, owner_id: str) -> dict[str, Any]:
    require_supabase()
    result = (supabase.table("notes").select("*").eq("id", note_id)
              .eq("user_id", owner_id).limit(1).execute())
    if not result.data:
        raise HTTPException(status_code=404, detail="Note not found in your collection.")
    note = result.data[0]
    image_result = (supabase.table("note_images")
                    .select("id,storage_path,display_order")
                    .eq("note_id", note_id).order("display_order").execute())
    images = []
    for image in image_result.data or []:
        try:
            signed = supabase.storage.from_(STORAGE_BUCKET).create_signed_url(image["storage_path"], 900)
            url = signed.get("signedURL") or signed.get("signedUrl")
            if url and url.startswith("/"):
                url = SUPABASE_URL.rstrip("/") + url
            if url:
                images.append({**image, "url": url})
        except Exception:
            continue
    note["images"] = images
    return note
