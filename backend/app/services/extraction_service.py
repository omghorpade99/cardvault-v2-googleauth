from typing import Any
from app.services.gemini_service import generate_json, image_parts

EXTRACTION_PROMPT = """
Extract contact details from the attached business-card image(s). Do not use web search.
Never guess or invent missing information. Preserve exact spelling and phone formatting.
Return ONLY JSON in this shape:
{
 "person_name": null,
 "job_title": null,
 "company_name": null,
 "emails": [],
 "phone_numbers": [],
 "website": null,
 "address": null,
 "other_text": [],
 "confidence_notes": []
}
Use null for unknown single values and [] for unknown lists. If several cards are present,
combine details only if they clearly belong to the same person; otherwise include a contacts array
with one object per distinct card and set the primary contact from the first card.
"""

def extract_contact(note: dict[str, Any], api_key: str) -> tuple[dict[str, Any], str]:
    images = note.get("images") or []
    if not images:
        raise ValueError("This note has no readable business-card images.")
    context = note.get("summary") or "(No additional note context.)"
    prompt = f"User's note context (not proof of identity):\n{context}\n\n{EXTRACTION_PROMPT}"
    result, model = generate_json(prompt, api_key, image_parts(images))
    return result, model
