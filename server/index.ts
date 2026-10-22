import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import archiver from "archiver";

const app = express();
const port = Number(process.env.PORT || 8000);
const isProd = process.env.NODE_ENV === "production";
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
for (const key of required) if (!process.env[key]) console.warn(`Missing environment variable: ${key}`);
const configured = required.every((key) => Boolean(process.env[key]));
const supabase = configured ? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
}) : null;
const BUCKET = "business-card-images";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) return cb(new Error("Use JPEG, PNG, or WebP images."));
    cb(null, true);
  },
});

type UserRequest = express.Request & { cardvaultUserId?: string };
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

function fail(res: express.Response, error: unknown) {
  console.error(error);
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  return res.status(500).json({ error: message.includes("duplicate") ? "A duplicate record was detected. Please retry." : safeError(error) });
}
function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/permission|key|jwt|secret|token|postgres|database|storage|auth/i.test(message)) return "The storage operation failed. Check the server configuration and Supabase authentication settings.";
  return message || "Unexpected server error.";
}
async function requireUser(req: UserRequest, res: express.Response, next: express.NextFunction) {
  if (!configured || !supabase) return res.status(503).json({ error: "Server setup is incomplete. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env." });
  const authorization = req.header("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "Your private session is missing. Refresh the page to reconnect." });
  try {
    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data.user) return res.status(401).json({ error: "Your private session has expired. Refresh the page to reconnect." });
    req.cardvaultUserId = data.user.id;
    next();
  } catch {
    res.status(401).json({ error: "Could not verify your private session. Refresh the page and try again." });
  }
}
function userId(req: UserRequest): string {
  if (!req.cardvaultUserId) throw new Error("Authenticated user was not resolved.");
  return req.cardvaultUserId;
}
async function signedImage(storagePath: string) {
  const { data, error } = await supabase!.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
async function getNote(id: string, ownerId: string) {
  const { data: note, error } = await supabase!.from("notes").select("*").eq("id", id).eq("user_id", ownerId).single();
  if (error) throw error;
  const { data: rows, error: imageError } = await supabase!.from("note_images").select("*").eq("note_id", id).order("display_order");
  if (imageError) throw imageError;
  const images = await Promise.all((rows || []).map(async (row) => ({ ...row, url: await signedImage(row.storage_path) })));
  return { ...note, images };
}
async function removeStorage(paths: string[]) {
  if (!paths.length) return;
  const { error } = await supabase!.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}
function extension(file: Express.Multer.File) {
  return file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
}
async function storeFile(ownerId: string, noteId: string, file: Express.Multer.File) {
  const imageId = crypto.randomUUID();
  const storagePath = `users/${ownerId}/notes/${noteId}/${imageId}.${extension(file)}`;
  const { error } = await supabase!.storage.from(BUCKET).upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw error;
  return { id: imageId, note_id: noteId, storage_path: storagePath };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, configured }));
app.use("/api/notes", requireUser);

app.get("/api/notes", async (req: UserRequest, res) => {
  try {
    const ownerId = userId(req);
    const { data, error } = await supabase!.from("notes").select("*").eq("user_id", ownerId).order("updated_at", { ascending: false });
    if (error) throw error;
    const notes = await Promise.all((data || []).map(async (note) => {
      const { data: rows, error: imageError } = await supabase!.from("note_images").select("*").eq("note_id", note.id).order("display_order");
      if (imageError) throw imageError;
      const images = await Promise.all((rows || []).map(async (row) => ({ ...row, url: await signedImage(row.storage_path) })));
      return { ...note, images };
    }));
    res.json({ notes });
  } catch (e) { fail(res, e); }
});

app.post("/api/notes", upload.array("images", 12), async (req: UserRequest, res) => {
  const ownerId = userId(req);
  const files = (req.files || []) as Express.Multer.File[];
  if (!files.length) return res.status(400).json({ error: "Add at least one business card image." });
  let noteId = "";
  const uploaded: string[] = [];
  try {
    const { data: note, error } = await supabase!.from("notes").insert({ user_id: ownerId, summary: String(req.body.summary || "").trim() || null }).select().single();
    if (error) throw error;
    noteId = note.id;
    for (const file of files) {
      const stored = await storeFile(ownerId, noteId, file);
      uploaded.push(stored.storage_path);
      const { error: insertError } = await supabase!.from("note_images").insert({ ...stored, display_order: uploaded.length - 1 });
      if (insertError) throw insertError;
    }
    res.status(201).json({ note: await getNote(noteId, ownerId) });
  } catch (e) {
    try { await removeStorage(uploaded); if (noteId) await supabase!.from("notes").delete().eq("id", noteId).eq("user_id", ownerId); } catch (cleanupError) { console.error("Create cleanup failed", cleanupError); }
    fail(res, e);
  }
});

app.put("/api/notes/:id", upload.array("newImages", 12), async (req: UserRequest, res) => {
  const ownerId = userId(req);
  const noteId = String(req.params.id);
  const files = (req.files || []) as Express.Multer.File[];
  const uploaded: string[] = [];
  try {
    const { data: ownedNote, error: ownedError } = await supabase!.from("notes").select("id").eq("id", noteId).eq("user_id", ownerId).maybeSingle();
    if (ownedError) throw ownedError;
    if (!ownedNote) return res.status(404).json({ error: "Note not found." });
    const { data: existing, error: existingError } = await supabase!.from("note_images").select("*").eq("note_id", noteId).order("display_order");
    if (existingError) throw existingError;
    const raw = JSON.parse(String(req.body.images || "[]")) as Array<{ existingId?: string; fileIndex?: number }>;
    const desired: Array<{ id?: string; fileIndex?: number; path?: string }> = [];
    for (const item of raw) {
      if (item.existingId) {
        const match = (existing || []).find((row) => row.id === item.existingId);
        if (!match) return res.status(400).json({ error: "One of the existing images is invalid." });
        desired.push({ id: match.id, path: match.storage_path });
      } else if (Number.isInteger(item.fileIndex) && item.fileIndex! >= 0 && item.fileIndex! < files.length) {
        const stored = await storeFile(ownerId, noteId, files[item.fileIndex!]);
        uploaded.push(stored.storage_path);
        desired.push({ fileIndex: item.fileIndex });
      }
    }
    if (!desired.length) return res.status(400).json({ error: "A note must contain at least one image." });
    const { error: noteError } = await supabase!.from("notes").update({ summary: String(req.body.summary || "").trim() || null, updated_at: new Date().toISOString() }).eq("id", noteId).eq("user_id", ownerId);
    if (noteError) throw noteError;
    const rows = desired.map((item, index) => ({ id: item.id || crypto.randomUUID(), note_id: noteId, storage_path: item.path || uploaded[item.fileIndex!], display_order: index }));
    const { error: deleteError } = await supabase!.from("note_images").delete().eq("note_id", noteId);
    if (deleteError) throw deleteError;
    const { error: insertError } = await supabase!.from("note_images").insert(rows);
    if (insertError) throw insertError;
    const keep = new Set(rows.map((row) => row.storage_path));
    const oldToDelete = (existing || []).map((row) => row.storage_path).filter((storagePath) => !keep.has(storagePath));
    try { await removeStorage(oldToDelete); } catch (cleanupError) { console.error("Old image cleanup needs retry", cleanupError); }
    res.json({ note: await getNote(noteId, ownerId) });
  } catch (e) {
    try { await removeStorage(uploaded); } catch (cleanupError) { console.error("New image cleanup failed", cleanupError); }
    fail(res, e);
  }
});

app.delete("/api/notes/:id", async (req: UserRequest, res) => {
  const ownerId = userId(req);
  try {
    const { data: ownedNote, error: ownedError } = await supabase!.from("notes").select("id").eq("id", req.params.id).eq("user_id", ownerId).maybeSingle();
    if (ownedError) throw ownedError;
    if (!ownedNote) return res.status(404).json({ error: "Note not found." });
    const { data: rows, error: imageError } = await supabase!.from("note_images").select("storage_path").eq("note_id", req.params.id);
    if (imageError) throw imageError;
    const { error: deleteError } = await supabase!.from("notes").delete().eq("id", req.params.id).eq("user_id", ownerId);
    if (deleteError) throw deleteError;
    try { await removeStorage((rows || []).map((row) => row.storage_path)); }
    catch (e) { console.error("Note deleted but storage cleanup failed", e); return res.status(500).json({ error: "The note was deleted, but some image files could not be cleaned up. Check server logs." }); }
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

// Download one or more selected notes as a ZIP containing text metadata and original images.
app.post("/api/notes/export", async (req: UserRequest, res) => {
  const ownerId = userId(req);
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter((id: unknown) => typeof id === "string" && id.length <= 100))] as string[] : [];
  if (!ids.length) return res.status(400).json({ error: "Select at least one note to download." });
  if (ids.length > 100) return res.status(400).json({ error: "Download up to 100 notes at a time." });
  try {
    const { data: notes, error } = await supabase!.from("notes").select("*").eq("user_id", ownerId).in("id", ids).order("created_at", { ascending: false });
    if (error) throw error;
    if (!notes?.length) return res.status(404).json({ error: "No selected notes were found in your collection." });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="cardvault-notes-${new Date().toISOString().slice(0, 10)}.zip"`);
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("warning", (err: Error) => console.warn("Export archive warning", err));
    archive.on("error", (err: Error) => { console.error("Export archive failed", err); res.destroy(err); });
    archive.pipe(res);
    for (let index = 0; index < notes.length; index++) {
      const note = notes[index];
      const { data: images, error: imageError } = await supabase!.from("note_images").select("*").eq("note_id", note.id).order("display_order");
      if (imageError) throw imageError;
      const folder = `note-${index + 1}-${note.id.slice(0, 8)}`;
      const textLines = [
        "CardVault note export", "", `Note ID: ${note.id}`,
        `Created: ${note.created_at}`, `Updated: ${note.updated_at}`, "",
        "Note text:", note.summary || "(No note text)", "",
        `Images: ${(images || []).length}`, ...(images || []).map((image, i) => `  ${i + 1}. image-${String(i + 1).padStart(2, "0")}.${image.storage_path.split(".").pop() || "jpg"}`),
      ];
      archive.append(textLines.join("\n"), { name: `${folder}/note.txt` });
      for (let imageIndex = 0; imageIndex < (images || []).length; imageIndex++) {
        const image = images![imageIndex];
        const { data: file, error: downloadError } = await supabase!.storage.from(BUCKET).download(image.storage_path);
        if (downloadError || !file) throw downloadError || new Error("Could not download an image for export.");
        const ext = image.storage_path.split(".").pop() || "jpg";
        archive.append(Buffer.from(await file.arrayBuffer()), { name: `${folder}/image-${String(imageIndex + 1).padStart(2, "0")}.${ext}` });
      }
    }
    await archive.finalize();
  } catch (e) {
    if (!res.headersSent) fail(res, e);
    else res.destroy(e instanceof Error ? e : undefined);
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Request failed.";
  res.status(400).json({ error: message.includes("File too large") ? "Each image must be 10 MB or smaller." : message });
});

if (isProd) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.resolve(here, "../dist")));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.resolve(here, "../dist/index.html")));
}
app.listen(port, () => console.log(`CardVault API listening on port ${port}`));
