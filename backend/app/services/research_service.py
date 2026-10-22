from typing import Any
from fastapi import HTTPException
from app.services.gemini_service import generate_research_json


async def research_company(note: dict[str, Any], api_key: str) -> tuple[dict[str, Any], str, list[dict[str, str]]]:
    contact = note.get("extracted_contact") or {}
    company = contact.get("company_name")
    if not company:
        raise HTTPException(status_code=422, detail="Extract contact details first and confirm the organization name before generating a report.")

    prompt = f"""
You are a business research analyst. Research the organization {company!r}.
Use Google Search grounding to find current, relevant, reputable sources. Verify the organization identity using
its website and address when available. Prefer the organization's official website, official company pages,
reputable business publications, and recent announcements. Distinguish verified facts from uncertain details.
Do not invent facts, citations, URLs, financial metrics, or dates.

Write a substantial report of approximately 600-800 words with these sections: Organization Overview,
Products and Services, Industry and Market Position, Headquarters and Operations, Important Developments,
Business Relevance, and Conversation Starters. Include 3-5 thoughtful professional conversation questions.

Return a single valid JSON object (no Markdown fences) with this schema:
{{"organization_name":"", "overview":"", "products_services":[], "industry":null,
"headquarters":null, "important_points":[], "potential_conversation_starters":[],
"full_report":"", "sources":[], "limitations":[]}}
The sources field may be empty; the application will attach the URLs returned by Google Search grounding.

Known contact details for disambiguation:
Website: {contact.get('website') or 'not provided'}
Address: {contact.get('address') or 'not provided'}
Job title: {contact.get('job_title') or 'not provided'}
"""
    report, model, sources = generate_research_json(prompt, api_key)
    report["organization_name"] = report.get("organization_name") or company
    report["sources"] = sources
    if not isinstance(report.get("full_report"), str) or not report["full_report"].strip():
        raise HTTPException(status_code=502, detail="Gemini did not return a complete company report.")
    if not sources:
        limitations = report.get("limitations")
        if not isinstance(limitations, list):
            limitations = []
        limitations.append("Gemini did not return source URLs in its Google Search grounding metadata for this response.")
        report["limitations"] = limitations
    return report, model, sources
