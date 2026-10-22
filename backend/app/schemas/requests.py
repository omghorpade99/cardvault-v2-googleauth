from pydantic import BaseModel, Field

class NoteIdsRequest(BaseModel):
    note_ids: list[str] = Field(min_length=1, max_length=20)
