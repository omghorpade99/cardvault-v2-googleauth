import type { Note } from "./types";
import { initializeSession, supabase } from "./lib/supabase";

async function authHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Your private session is missing. Refresh the page to reconnect.");
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = { ...(await authHeaders()), ...(options.headers as Record<string, string> | undefined) };
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

const aiApiBase = (import.meta.env.VITE_AI_API_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:8001";
async function aiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again to use AI features.");
  const response = await fetch(`${aiApiBase}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers as Record<string, string> | undefined) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || payload.error || `AI request failed (${response.status})`);
  return payload as T;
}

export const api = {
  initialize: initializeSession,
  extract: async (ids: string[]) => aiRequest<{
    results: Array<{ note_id: string; status: string; model: string; extracted_contact: Record<string, unknown> }>;
    errors: Array<{ note_id: string; error: string }>;
    requested: number;
  }>("/api/ai/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note_ids: ids }) }),
  research: async (ids: string[]) => aiRequest<{
    results: Array<{ note_id: string; status: string; model: string; company_report: Record<string, unknown>; research_sources: Array<{ title: string; url: string }> }>;
    errors: Array<{ note_id: string; error: string }>;
    requested: number;
  }>("/api/ai/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note_ids: ids }) }),
  testGeminiKey: (key: string) => aiRequest<{ ok: boolean; configured: boolean; last4: string; model: string; updated_at: string }>("/api/ai/key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: key }) }),
  getGeminiKeyStatus: () => aiRequest<{ configured: boolean; last4: string | null; updated_at: string | null }>("/api/ai/key"),
  removeGeminiKey: () => aiRequest<{ ok: boolean; configured: boolean }>("/api/ai/key", { method: "DELETE" }),
  list: () => request<{ notes: Note[] }>("/api/notes"),
  create: async (summary: string, images: File[]) => {
    const form = new FormData();
    form.append("summary", summary);
    images.forEach((file) => form.append("images", file));
    return request<{ note: Note }>("/api/notes", { method: "POST", body: form });
  },
  update: async (id: string, summary: string, images: Array<{ existingId?: string; file?: File }>) => {
    const form = new FormData();
    form.append("summary", summary);
    let nextFileIndex = 0;
    const manifest = images.map((image) => image.existingId
      ? { existingId: image.existingId }
      : { fileIndex: nextFileIndex++ });
    form.append("images", JSON.stringify(manifest));
    images.forEach((image) => { if (image.file) form.append("newImages", image.file); });
    return request<{ note: Note }>(`/api/notes/${id}`, { method: "PUT", body: form });
  },
  remove: (id: string) => request<{ ok: boolean }>(`/api/notes/${id}`, { method: "DELETE" }),
  exportNotes: async (ids: string[]) => {
    const response = await fetch("/api/notes/export", {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Export failed (${response.status})`);
    }
    return response.blob();
  },
};
