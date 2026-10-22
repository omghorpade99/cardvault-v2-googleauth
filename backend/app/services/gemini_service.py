from __future__ import annotations
import json
import logging
from typing import Any
from fastapi import HTTPException
from google import genai
from google.genai import types
from app.config import MODEL_NAMES

logger = logging.getLogger("cardvault.gemini")


def _client(api_key: str):
    cleaned = (api_key or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Add your Gemini API key in AI Settings before using AI features.")
    return genai.Client(api_key=cleaned)


def parse_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("Gemini did not return a JSON object.")
    data = json.loads(cleaned[start:end + 1])
    if not isinstance(data, dict):
        raise ValueError("Gemini response was not a JSON object.")
    return data


def generate_json(prompt: str, api_key: str, images: list[types.Part] | None = None) -> tuple[dict[str, Any], str]:
    client = _client(api_key)
    contents: list[Any] = [types.Part.from_text(text=prompt), *(images or [])]
    errors: list[str] = []
    for model in MODEL_NAMES:
        logger.info("Gemini request: model=%s, image_count=%d", model, len(images or []))
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(temperature=0.2, response_mime_type="application/json"),
            )
            if not response.text:
                raise ValueError("Gemini returned an empty response.")
            data = parse_json(response.text)
            logger.info("Gemini succeeded with %s", model)
            return data, model
        except Exception as exc:
            message = str(exc)
            logger.exception("Gemini failed for %s", model)
            errors.append(f"{model}: {message[:240]}")
            lowered = message.lower()
            if any(word in lowered for word in ("resource_exhausted", "quota", "billing", "permission_denied")):
                raise HTTPException(status_code=503, detail=f"Gemini quota, billing, or permission error. Check the Google AI project. {message[:500]}") from exc
    raise HTTPException(status_code=502, detail="All configured Gemini models failed. " + " | ".join(errors)[-1500:])


def image_parts(images: list[dict[str, Any]]) -> list[types.Part]:
    import httpx
    parts: list[types.Part] = []
    allowed = {"image/jpeg", "image/png", "image/webp"}
    with httpx.Client(timeout=30, follow_redirects=True) as client:
        for image in images:
            response = client.get(image["url"])
            response.raise_for_status()
            mime = response.headers.get("content-type", "image/jpeg").split(";", 1)[0].lower()
            if mime not in allowed:
                mime = "image/jpeg"
            parts.append(types.Part.from_bytes(data=response.content, mime_type=mime))
    return parts


def test_api_key(api_key: str) -> str:
    """Make a small request to verify the supplied key and return the working model."""
    client = _client(api_key)
    errors: list[str] = []
    for model in MODEL_NAMES:
        try:
            response = client.models.generate_content(
                model=model,
                contents="Reply with the single word OK.",
                config=types.GenerateContentConfig(temperature=0),
            )
            if response.text and response.text.strip():
                return model
        except Exception as exc:
            message = str(exc)
            errors.append(f"{model}: {message[:180]}")
            lowered = message.lower()
            if any(word in lowered for word in ("resource_exhausted", "quota", "billing", "permission_denied", "api key not valid", "invalid api key")):
                raise HTTPException(status_code=400, detail=f"Gemini key could not complete a test request. Check key access, model availability, quota, and billing. {message[:350]}") from exc
    raise HTTPException(status_code=400, detail="Gemini key test failed. " + " | ".join(errors)[-800:])


def generate_research_json(prompt: str, api_key: str) -> tuple[dict[str, Any], str, list[dict[str, str]]]:
    """Use Gemini's built-in Google Search grounding and return grounded web sources.

    The user's key is supplied per request and is never persisted by this service.
    """
    client = _client(api_key)
    errors: list[str] = []
    for model in MODEL_NAMES:
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                ),
            )
            if not response.text:
                raise ValueError("Gemini returned an empty research response.")
            report = parse_json(response.text)
            sources: list[dict[str, str]] = []
            candidates = getattr(response, "candidates", None) or []
            for candidate in candidates:
                metadata = getattr(candidate, "grounding_metadata", None)
                chunks = getattr(metadata, "grounding_chunks", None) or []
                for chunk in chunks:
                    web = getattr(chunk, "web", None)
                    if web is None:
                        continue
                    uri = getattr(web, "uri", None)
                    title = getattr(web, "title", None) or uri
                    if isinstance(uri, str) and uri.startswith(("https://", "http://")):
                        if not any(item["url"] == uri for item in sources):
                            sources.append({"title": str(title or "Web source"), "url": uri})
            return report, model, sources
        except HTTPException:
            raise
        except Exception as exc:
            message = str(exc)
            errors.append(f"{model}: {message[:220]}")
            lowered = message.lower()
            if any(word in lowered for word in ("resource_exhausted", "quota", "billing", "permission_denied", "api key not valid", "invalid api key")):
                raise HTTPException(status_code=503, detail=f"Gemini Search grounding failed because of quota, billing, permission, or key access. Check your Gemini API project. {message[:400]}") from exc
    raise HTTPException(
        status_code=502,
        detail="Gemini Google Search grounding failed for all configured models. Confirm that your API key and a selected model support Google Search grounding. " + " | ".join(errors)[-1200:],
    )
