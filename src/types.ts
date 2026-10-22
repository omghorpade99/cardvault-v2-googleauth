export type NoteImage = {
  id: string;
  note_id: string;
  storage_path: string;
  display_order: number;
  url: string;
};

export type Note = {
  id: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  images: NoteImage[];
  extracted_contact?: Record<string, unknown> | null;
  extraction_status?: "pending" | "completed" | "failed" | null;
  extraction_model?: string | null;
  extracted_at?: string | null;
  company_report?: Record<string, unknown> | null;
  research_sources?: Array<{ title: string; url: string }> | null;
  research_status?: "pending" | "completed" | "failed" | null;
  research_model?: string | null;
  researched_at?: string | null;
  ai_analysis?: Record<string, unknown> | null;
  ai_status?: "pending" | "processing" | "completed" | "failed" | null;
  ai_model?: string | null;
  ai_analyzed_at?: string | null;
};

export type DraftImage =
  | { kind: "existing"; id: string; url: string; storage_path: string; display_order: number; file?: never }
  | { kind: "new"; id: string; url: string; file: File; storage_path?: never; display_order: number };
