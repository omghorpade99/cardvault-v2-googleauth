import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, ArrowLeft, Check, CheckSquare, ChevronLeft, ChevronRight, CircleHelp, Clock3,
  Download, ImagePlus, Pencil, Plus, Search, ShieldCheck, Sparkles, Square,
  Trash2, UploadCloud, X, ZoomIn, LogOut, UserRound, Globe, ExternalLink, KeyRound, Settings, Eye, EyeOff,
} from "lucide-react";
import { api } from "./api";
import { signInWithGoogle, signOut, supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import CameraCapture from "./components/CameraCapture";
import EmptyState from "./components/EmptyState";
import NoteCard from "./components/NoteCard";
import DigitalBusinessCard from "./components/DigitalBusinessCard";
import { dateLabel, errorText } from "./lib/format";
import type { DraftImage, Note } from "./types";

const MAX_SIZE = 10 * 1024 * 1024;
const accepted = ["image/jpeg", "image/png", "image/webp"];
const uid = () => crypto.randomUUID();
const configuredKeyMarker = "configured";
const uniqueNotes = (items: Note[]) => { const seen = new Set<string>(); return items.filter((note) => { if (seen.has(note.id)) return false; seen.add(note.id); return true; }); };
function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.98 46.98 31.86 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;
}
function App() {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyTesting, setKeyTesting] = useState(false);
  const [keyStatus, setKeyStatus] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [detail, setDetail] = useState<Note | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [researching, setResearching] = useState(false);
  const [aiReport, setAiReport] = useState<{ results: Array<{ note_id: string; status: string; model: string; analysis: Record<string, unknown> }>; errors: Array<{ note_id: string; error: string }> } | null>(null);
  const [summary, setSummary] = useState("");
  const [draftImages, setDraftImages] = useState<DraftImage[]>([]);
  const [draftError, setDraftError] = useState("");
  const [lightbox, setLightbox] = useState<{ note: Note; index: number } | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const saveLockRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await api.list(); setNotes(uniqueNotes(result.notes)); }
    catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!session?.user?.id) {
      setGeminiKey("");
      setKeyDraft("");
      return;
    }
    // The backend stores each user's encrypted key; never retrieve the raw key into the browser.
    setGeminiKey("");
    setKeyDraft("");
    setKeyStatus("");
    void api.getGeminiKeyStatus().then((status) => {
      if (!cancelled) {
        setGeminiKey(status.configured ? configuredKeyMarker : "");
        setKeyStatus(status.configured ? `A Gemini API key ending in ${status.last4 || "••••"} is saved to your account.` : "");
      }
    }).catch(() => {
      if (!cancelled) { setGeminiKey(""); setKeyStatus(""); }
    });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  useEffect(() => {
    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!alive) return;
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession) {
        if (event === "SIGNED_IN") {
          // Defer Supabase calls out of the auth callback to avoid locking the auth client.
          window.setTimeout(() => { if (alive) void load(); }, 0);
        }
      } else {
        setNotes([]);
        setSelectedIds([]);
        setDetail(null);
        setLoading(false);
      }
    });
    api.initialize()
      .then(async (currentSession) => {
        if (!alive) return;
        setSession(currentSession);
        if (currentSession) await load();
        else setLoading(false);
      })
      .catch((cause) => { if (alive) { setAuthError(errorText(cause)); setLoading(false); } })
      .finally(() => { if (alive) setAuthReady(true); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (lightbox) setLightbox(null);
        else if (deleteTarget) setDeleteTarget(null);
        else if (detail) setDetail(null);
        else if (editorOpen) closeEditor();
      }
      if (lightbox && event.key === "ArrowRight") setLightbox((v) => v ? { ...v, index: (v.index + 1) % v.note.images.length } : v);
      if (lightbox && event.key === "ArrowLeft") setLightbox((v) => v ? { ...v, index: (v.index - 1 + v.note.images.length) % v.note.images.length } : v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const visibleNotes = useMemo(() => notes.filter((note) => (note.summary || "").toLowerCase().includes(query.trim().toLowerCase())), [notes, query]);


  function openCreate() {
    setEditing(null); setSummary(""); setDraftImages([]); setDraftError(""); setEditorOpen(true);
  }
  function openEdit(note: Note) {
    setEditing(note); setSummary(note.summary || "");
    setDraftImages(note.images.map((image) => ({ kind: "existing", id: image.id, url: image.url, storage_path: image.storage_path, display_order: image.display_order })));
    setDraftError(""); setDetail(null); setEditorOpen(true);
  }
  function closeEditor(force = false) {
    if (busy && !force) return;
    if (draftImages.some((image) => image.kind === "new")) {
      draftImages.filter((image) => image.kind === "new").forEach((image) => URL.revokeObjectURL(image.url));
    }
    setEditorOpen(false); setEditing(null); setDraftImages([]); setSummary(""); setDraftError("");
  }
  function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    const errors: string[] = [];
    const valid: DraftImage[] = [];
    for (const file of incoming) {
      if (!accepted.includes(file.type)) { errors.push(`${file.name}: use JPEG, PNG, or WebP.`); continue; }
      if (file.size > MAX_SIZE) { errors.push(`${file.name}: larger than 10 MB.`); continue; }
      valid.push({ kind: "new", id: uid(), url: URL.createObjectURL(file), file, display_order: draftImages.length + valid.length });
    }
    setDraftImages((current) => [...current, ...valid]);
    setDraftError(errors.join(" "));
    if (valid.length && pickerRef.current) pickerRef.current.value = "";
  }
  function removeDraft(id: string) {
    setDraftImages((current) => {
      const removed = current.find((image) => image.id === id);
      if (removed?.kind === "new") URL.revokeObjectURL(removed.url);
      return current.filter((image) => image.id !== id).map((image, index) => ({ ...image, display_order: index }));
    });
  }
  function moveDraft(index: number, offset: number) {
    setDraftImages((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current]; [next[index], next[target]] = [next[target], next[index]];
      return next.map((image, i) => ({ ...image, display_order: i }));
    });
  }

  async function saveNote(event: React.FormEvent) {
    event.preventDefault();
    if (saveLockRef.current) return;
    setDraftError("");
    if (!draftImages.length) { setDraftError("Add at least one business card image before saving."); return; }
    saveLockRef.current = true;
    setBusy(true);
    try {
      if (!editing) {
        const result = await api.create(summary, draftImages.filter((image): image is Extract<DraftImage, { kind: "new" }> => image.kind === "new").map((image) => image.file));
        setNotes((current) => uniqueNotes([result.note, ...current])); setToast("Note saved successfully.");
      } else {
        const payload = draftImages.map((image) => image.kind === "existing" ? { existingId: image.id } : { file: image.file });
        const result = await api.update(editing.id, summary, payload);
        setNotes((current) => current.map((note) => note.id === editing.id ? result.note : note));
        setToast("Changes saved.");
      }
      closeEditor(true);
    } catch (e) { setDraftError(errorText(e)); }
    finally { setBusy(false); saveLockRef.current = false; }
  }

  async function deleteNote() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.remove(deleteTarget.id);
      setNotes((current) => current.filter((note) => note.id !== deleteTarget.id));
      setSelectedIds((current) => current.filter((id) => id !== deleteTarget.id));
      setDeleteTarget(null); setDetail(null); setToast("Note deleted.");
    } catch (e) { setToast(errorText(e)); }
    finally { setBusy(false); }
  }

  async function downloadNotes(ids: string[]) {
    if (!ids.length || exporting) return;
    setExporting(true);
    try {
      const blob = await api.exportNotes(ids);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cardvault-${ids.length === 1 ? "note" : `${ids.length}-notes`}-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast(ids.length === 1 ? "Note download started." : `${ids.length} notes download started.`);
    } catch (cause) { setToast(errorText(cause)); }
    finally { setExporting(false); }
  }

  async function extractNotes(ids: string[]) {
    if (!geminiKey) { setSettingsOpen(true); setKeyStatus("Add your Gemini API key to use contact extraction."); return; }
    if (!ids.length || extracting) return;
    setExtracting(true);
    try {
      const result = await api.extract(ids);
      setNotes((current) => current.map((note) => {
        const item = result.results.find((entry) => entry.note_id === note.id);
        return item ? { ...note, extracted_contact: item.extracted_contact, extraction_status: "completed", extraction_model: item.model, extracted_at: new Date().toISOString() } : note;
      }));
      setDetail((current) => current ? (result.results.find((item) => item.note_id === current.id) ? { ...current, extracted_contact: result.results.find((item) => item.note_id === current.id)!.extracted_contact, extraction_status: "completed" } : current) : current);
      setSelectedIds((current) => current.filter((id) => !result.results.some((item) => item.note_id === id)));
      setToast(`${result.results.length} contact${result.results.length === 1 ? "" : "s"} extracted${result.errors.length ? `; ${result.errors.length} failed` : ""}.`);
      if (result.errors.length) setAiReport({ results: [], errors: result.errors });
    } catch (cause) { setToast(errorText(cause)); }
    finally { setExtracting(false); }
  }

  async function researchNotes(ids: string[]) {
    if (!geminiKey) { setSettingsOpen(true); setKeyStatus("Add your Gemini API key to research organizations."); return; }
    if (!ids.length || researching) return;
    setResearching(true);
    try {
      const result = await api.research(ids);
      setNotes((current) => current.map((note) => {
        const item = result.results.find((entry) => entry.note_id === note.id);
        return item ? { ...note, company_report: item.company_report, research_sources: item.research_sources, research_status: "completed", research_model: item.model, researched_at: new Date().toISOString() } : note;
      }));
      setDetail((current) => current ? (result.results.find((item) => item.note_id === current.id) ? { ...current, company_report: result.results.find((item) => item.note_id === current.id)!.company_report, research_sources: result.results.find((item) => item.note_id === current.id)!.research_sources, research_status: "completed" } : current) : current);
      if (result.results.length) setAiReport({ results: result.results.map((item) => ({ note_id: item.note_id, status: item.status, model: item.model, analysis: item.company_report })), errors: result.errors });
      setToast(`${result.results.length} report${result.results.length === 1 ? "" : "s"} generated${result.errors.length ? `; ${result.errors.length} failed` : ""}.`);
    } catch (cause) { setToast(errorText(cause)); }
    finally { setResearching(false); }
  }

  async function saveGeminiKey() {
    const trimmed = keyDraft.trim();
    if (!trimmed) { setKeyStatus("Paste your Gemini API key first."); return; }
    if (!session?.user?.id) { setKeyStatus("Sign in before saving your Gemini API key."); return; }
    setKeyTesting(true);
    setKeyStatus("Validating and securely saving your key…");
    try {
      const result = await api.testGeminiKey(trimmed);
      setGeminiKey(configuredKeyMarker);
      setKeyDraft("");
      setKeyStatus(`Connected successfully using ${result.model}. Your key is encrypted and saved to your account.`);
      setToast("Gemini API key saved to your account.");
    } catch (cause) { setKeyStatus(errorText(cause)); }
    finally { setKeyTesting(false); }
  }

  async function testGeminiKey() {
    await saveGeminiKey();
  }

  async function clearGeminiKey() {
    try {
      await api.removeGeminiKey();
      setGeminiKey(""); setKeyDraft("");
      setKeyStatus("Gemini API key removed from your account.");
      setToast("Gemini API key removed.");
    } catch (cause) { setKeyStatus(errorText(cause)); }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    const visibleIds = visibleNotes.map((note) => note.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  }

  if (!authReady) return <div className="splash"><div className="brand-mark"><Archive size={24}/></div><span>CardVault</span><div className="spinner"/></div>;

  if (!session) return (
    <div className="unlock-screen">
      <div className="unlock-orb orb-one"/><div className="unlock-orb orb-two"/>
      <section className="unlock-card" aria-labelledby="signin-title">
        <a className="brand-lockup" href="#" onClick={(event) => event.preventDefault()} aria-label="CardVault"><div className="brand-mark"><Archive size={21}/></div><span>CardVault</span><span className="brand-dot">.</span></a>
        <div className="unlock-icon"><ShieldCheck size={24}/></div>
        <p className="eyebrow">YOUR PRIVATE NETWORK</p>
        <h1 id="signin-title">Your connections,<br/>kept close.</h1>
        <p className="muted unlock-copy">Sign in once to keep your business cards, contact details, and company research safely synced to your account.</p>
        {authError && <div className="error-panel"><CircleHelp size={18}/><div><strong>Sign-in unavailable</strong><p>{authError}</p></div></div>}
        <button className="button primary full google-signin" disabled={authBusy} onClick={async () => { setAuthBusy(true); setAuthError(""); try { await signInWithGoogle(); } catch (cause) { setAuthError(errorText(cause)); setAuthBusy(false); } }}>
          {authBusy ? <span className="button-spinner"/> : <GoogleMark/>}{authBusy ? "Redirecting to Google…" : "Continue with Google"}
        </button>
        <p className="secure-note"><ShieldCheck size={14}/> Your cards are private to your account.</p>
      </section>
      <p className="unlock-footer">Made for the people you meet.</p>
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Main navigation">
        <div className="sidebar-section-label">WORKSPACE</div>
        <button className="sidebar-nav-item active" onClick={() => { setDetail(null); setSettingsOpen(false); }}><Archive size={17}/><span>My Cards</span></button>
        <button className={`sidebar-nav-item ${settingsOpen ? "active" : ""}`} onClick={() => { setKeyDraft(""); setKeyStatus(geminiKey ? "A Gemini API key is saved to your account. Enter a new key to replace it." : ""); setSettingsOpen(true); }}><KeyRound size={17}/><span>My Gemini API Key</span>{geminiKey && <span className="key-ready-dot" title="API key saved for this tab"/>}</button>
        <div className="sidebar-spacer"/>
        <div className="sidebar-key-note"><ShieldCheck size={15}/><span>Your key is encrypted and saved to your account; each AI request uses only the signed-in user’s key.</span></div>
      </aside>
      <header className="topbar">
        <a className="brand-lockup" href="#" onClick={(e) => { e.preventDefault(); setDetail(null); }} aria-label="CardVault home">
          <div className="brand-mark"><Archive size={21}/></div><span>CardVault</span><span className="brand-dot">.</span>
        </a>
        <div className="topbar-right">
          <div className="secure-pill"><span/> Private collection</div>
          <button className="icon-button" title={session.user.email || "Signed in"} aria-label="Sign out" onClick={async () => { try { await signOut(); setToast("Signed out."); } catch (cause) { setToast(errorText(cause)); } }}><LogOut size={17}/></button>
          <button className="button primary top-add" onClick={openCreate}><Plus size={17}/> Add note</button>
        </div>
      </header>

      <main className="main-content">
        <section className="welcome-row">
          <div>
            <p className="eyebrow"><Sparkles size={13}/> YOUR PROFESSIONAL NETWORK</p>
            <h1>Good connections<br className="mobile-break"/> deserve to be kept.</h1>
            <p className="muted intro">Every card, every conversation, all in one thoughtful place.</p>
          </div>
          <div className="collection-count"><div className="count-icon"><Archive size={18}/></div><div><strong>{notes.length.toLocaleString()}</strong><span>{notes.length === 1 ? "saved note" : "saved notes"}</span></div></div>
        </section>

        <section className="toolbar">
          <div className="search-box"><Search size={18}/><input aria-label="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your notes…"/>{query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search"><X size={15}/></button>}</div>
          <span className="sort-label"><Clock3 size={14}/> Recently updated</span>
          {visibleNotes.length > 0 && <button className="button secondary small selection-toggle" onClick={toggleAllVisible}>{visibleNotes.every((note) => selectedIds.includes(note.id)) ? <CheckSquare size={15}/> : <Square size={15}/>} {visibleNotes.every((note) => selectedIds.includes(note.id)) ? "Clear selection" : "Select all"}</button>}
          {selectedIds.length > 0 && <button className="button secondary small" disabled={extracting} onClick={() => void extractNotes(selectedIds)}><Sparkles size={15}/>{extracting ? "Extracting…" : `Extract text (${selectedIds.length})`}</button>}
          {selectedIds.length > 0 && <button className="button secondary small" disabled={researching} onClick={() => void researchNotes(selectedIds)}><Globe size={15}/>{researching ? "Researching…" : `Research (${selectedIds.length})`}</button>}
          {selectedIds.length > 0 && <button className="button secondary small download-selected" disabled={exporting} onClick={() => void downloadNotes(selectedIds)}><Download size={15}/>{exporting ? "Preparing…" : `Download (${selectedIds.length})`}</button>}
          <button className="button primary desktop-add" onClick={openCreate}><Plus size={17}/> Add note</button>
        </section>

        {error ? <div className="error-panel"><CircleHelp size={21}/><div><strong>We couldn't load your collection</strong><p>{error}</p><button className="button secondary" onClick={() => void load()}>Try again</button></div></div> :
          loading ? <div className="notes-grid">{Array.from({ length: 6 }, (_, i) => <div className="skeleton-card" key={i}><div className="skeleton-image"/><div className="skeleton-line"/><div className="skeleton-line short"/></div>)}</div> :
          visibleNotes.length ? <div className="notes-grid">{visibleNotes.map((note) => <NoteCard key={note.id} note={note} selected={selectedIds.includes(note.id)} onSelect={() => toggleSelected(note.id)} onDownload={() => void downloadNotes([note.id])} onOpen={() => setDetail(note)} onEdit={() => openEdit(note)} onDelete={() => setDeleteTarget(note)}/>)}</div> :
          <EmptyState searching={Boolean(query)} onCreate={openCreate} onClear={() => setQuery("")}/>}

        <footer className="page-footer"><span>Made for the people you meet.</span><span><ShieldCheck size={14}/> Your workspace, your network</span></footer>
      </main>

      {editorOpen && <div className="overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) closeEditor(); }}>
        <section className="modal editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
          <div className="modal-header"><div><p className="eyebrow">{editing ? "KEEP IT UP TO DATE" : "SAVE A NEW CONNECTION"}</p><h2 id="editor-title">{editing ? "Edit your note" : "Add to your network"}</h2></div><button className="icon-button" onClick={() => closeEditor()} aria-label="Close editor"><X size={19}/></button></div>
          <form onSubmit={saveNote}>
            <div className="form-section"><div className="section-heading"><span className="step-number">01</span><div><h3>Business card photos</h3><p>Add one or more images. Up to 10 MB each.</p></div></div>
              <div className="upload-actions">
                <button type="button" className="upload-choice" onClick={() => setCameraOpen(true)}><div className="upload-choice-icon"><ImagePlus size={19}/></div><span><strong>Take a photo</strong><small>Open live camera</small></span></button>
                <button type="button" className="upload-choice" onClick={() => pickerRef.current?.click()}><div className="upload-choice-icon"><UploadCloud size={19}/></div><span><strong>Choose photos</strong><small>From your device</small></span></button>
                <input ref={pickerRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => addFiles(e.target.files)}/>
              </div>
              {draftImages.length > 0 && <div className="draft-grid">{draftImages.map((image, index) => <div className="draft-image" key={image.id}><img src={image.url} alt={`Business card ${index + 1}`} /><span className="image-index">{index + 1}</span><div className="draft-controls"><button type="button" disabled={index === 0} onClick={() => moveDraft(index, -1)} title="Move earlier" aria-label="Move image earlier"><ChevronLeft size={14}/></button><button type="button" disabled={index === draftImages.length - 1} onClick={() => moveDraft(index, 1)} title="Move later" aria-label="Move image later"><ChevronRight size={14}/></button><button type="button" onClick={() => removeDraft(image.id)} title="Remove image" aria-label="Remove image"><X size={14}/></button></div></div>)}</div>}
              {draftImages.length === 0 && <div className="upload-hint"> <ImagePlus size={17}/> Your card photos will appear here</div>}
              {draftError && <p className="form-error" role="alert">{draftError}</p>}
              <p className="tiny-note"><ShieldCheck size={13}/> Stored in your private image vault. Original image quality is preserved.</p>
            </div>
            <div className="form-section summary-section"><div className="section-heading"><span className="step-number">02</span><div><h3>Add a little context <span className="optional">(optional)</span></h3><p>Where you met or what to follow up on.</p></div></div>
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Met at the tech conference… interested in a partnership…" rows={3} maxLength={3000}/><div className="character-count">{summary.length}/3000</div>
            </div>
            <div className="modal-footer"><span className="required-note">* At least one photo is required</span><div className="footer-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => closeEditor()}>Cancel</button><button className="button primary" type="submit" disabled={busy}>{busy ? <><span className="button-spinner"/> Saving…</> : <><Check size={17}/> {editing ? "Save changes" : "Save note"}</>}</button></div></div>
          </form>
        </section>
      </div>}

      {cameraOpen && <CameraCapture onCapture={(file) => addFiles([file])} onClose={() => setCameraOpen(false)} />}

      {detail && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }} role="presentation"><section className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="modal-header detail-header"><button className="back-button" onClick={() => setDetail(null)}><ArrowLeft size={17}/> Back to notes</button><div className="detail-actions"><button className="button secondary small" disabled={extracting} onClick={() => void extractNotes([detail.id])}><Sparkles size={15}/>{extracting ? "Extracting…" : "Extract Text"}</button><button className="button secondary small" disabled={researching} onClick={() => void researchNotes([detail.id])}><Globe size={15}/>{researching ? "Researching…" : "Research & Report"}</button><button className="button secondary small" onClick={() => void downloadNotes([detail.id])} disabled={exporting}><Download size={15}/> Download</button><button className="button secondary small" onClick={() => openEdit(detail)}><Pencil size={15}/> Edit</button><button className="icon-button danger-icon" aria-label="Delete note" onClick={() => setDeleteTarget(detail)}><Trash2 size={17}/></button></div></div>
        <div className="detail-body"><div className="detail-heading"><p className="eyebrow">SAVED CONNECTION</p><h2 id="detail-title">{detail.summary?.trim() ? detail.summary.split("\n")[0].slice(0, 100) : "Business cards"}</h2><p className="muted detail-date">Last updated {dateLabel(detail.updated_at)} · {detail.images.length} {detail.images.length === 1 ? "photo" : "photos"}</p></div>
          <div className="detail-gallery">{detail.images.map((image, i) => <button key={image.id} className="detail-image" onClick={() => setLightbox({ note: detail, index: i })} aria-label={`View photo ${i + 1}`}><img src={image.url} alt={`Business card ${i + 1}`} /><span><ZoomIn size={16}/></span></button>)}</div>
          {detail.summary && <div className="detail-summary"><h3>Your note</h3><p>{detail.summary}</p></div>}
          {(detail.extracted_contact || detail.extraction_status === "completed") ? <div className="detail-summary extracted-contact-section"><h3><UserRound size={16}/> Digital business card</h3><p className="muted">Contact information extracted from the business card.</p><DigitalBusinessCard contact={(detail.extracted_contact || {}) as { person_name?: string | null; job_title?: string | null; company_name?: string | null; emails?: string[]; phone_numbers?: string[]; website?: string | null; address?: string | null; other_text?: string[] }} /></div> : <div className="detail-summary extracted-contact-section"><h3><UserRound size={16}/> Digital business card</h3><p className="muted">Your extracted contact details will appear here. Select Extract Text to create the digital card for this note.</p></div>}
          {detail.company_report && <div className="detail-summary ai-saved-report"><h3><Globe size={16}/> Organization research</h3><p className="muted">Saved report{detail.research_model ? ` · ${detail.research_model}` : ""}</p><button className="button secondary small" onClick={() => setAiReport({ results: [{ note_id: detail.id, status: "completed", model: detail.research_model || "", analysis: detail.company_report! }], errors: [] })}>Open full report</button></div>}
          <div className="detail-bottom"><span><Clock3 size={14}/> Created {dateLabel(detail.created_at)}</span><button className="text-button danger-text" onClick={() => setDeleteTarget(detail)}><Trash2 size={14}/> Delete this note</button></div>
        </div>
      </section></div>}

      {settingsOpen && <div className="overlay settings-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}><section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="modal-header"><div><p className="eyebrow"><Settings size={13}/> PERSONAL AI CONFIGURATION</p><h2 id="settings-title">My Gemini API key</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={19}/></button></div><div className="settings-body"><div className="settings-info"><KeyRound size={19}/><div><strong>Use your own Gemini quota</strong><p>CardVault uses this key for two separate Gemini tasks: reading business cards and generating organization research reports.</p></div></div><label className="settings-label" htmlFor="gemini-api-key">Gemini API key</label><div className="api-key-input-wrap"><input id="gemini-api-key" type={showKey ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder="Paste your Gemini API key" value={keyDraft} onChange={(e) => { setKeyDraft(e.target.value); setKeyStatus(""); }}/><button className="icon-button" type="button" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? "Hide API key" : "Show API key"}>{showKey ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div><p className="settings-help">Get a key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>. Your key is encrypted by the backend and saved to your signed-in account. The raw key is never returned to the browser after saving. Use Remove key to delete it from your account.</p>{keyStatus && <div className={`key-status ${keyStatus.toLowerCase().includes("successfully") || keyStatus.toLowerCase().includes("saved") || keyStatus.toLowerCase().includes("removed") ? "success" : ""}`} role="status">{keyStatus}</div>}<div className="settings-actions"><button className="button secondary" disabled={keyTesting} onClick={() => void testGeminiKey()}>{keyTesting ? <span className="button-spinner"/> : <ShieldCheck size={15}/>} Test & Save</button><button className="button primary" disabled={keyTesting} onClick={() => void saveGeminiKey()}><Check size={15}/> Save key</button>{geminiKey && <button className="button secondary" onClick={clearGeminiKey}>Remove key</button>}</div><div className="settings-divider"/><h3>What each service does</h3><div className="service-explainer"><div><Sparkles size={17}/><span><strong>Extract & Organize</strong><small>Gemini reads card images and structures names, roles, organization, emails, phone numbers, website, and address. No web search is used.</small></span></div><div><Globe size={17}/><span><strong>Research Organization</strong><small>Gemini uses its built-in Google Search grounding to find current sources and create a separate report. Your key and model must support Search grounding.</small></span></div></div><p className="settings-security"><ShieldCheck size={14}/> Never share your API key. Google may charge for usage according to your API project's limits and billing.</p></div></section></div>}

      {aiReport && <div className="overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setAiReport(null); }}><section className="modal detail-modal ai-report-modal" role="dialog" aria-modal="true" aria-labelledby="ai-report-title"><div className="modal-header"><div><p className="eyebrow"><Sparkles size={13}/> CARDVAULT V2</p><h2 id="ai-report-title">AI business intelligence</h2></div><button className="icon-button" onClick={() => setAiReport(null)} aria-label="Close AI report"><X size={19}/></button></div><div className="detail-body">{aiReport.results.map((item) => <section key={item.note_id} className="ai-result"><h3>{notes.find((note) => note.id === item.note_id)?.summary?.split("\n")[0] || "Business card analysis"}</h3><p className="muted">Model used: {item.model}</p>{typeof item.analysis.full_report === "string" ? <div className="company-report-content"><p>{item.analysis.full_report}</p>{Array.isArray(item.analysis.sources) && <div className="report-sources"><h4>Sources</h4>{(item.analysis.sources as Array<{ title?: string; url?: string }>).map((source, index) => source.url ? <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url} <ExternalLink size={13}/></a> : null)}</div>}</div> : <pre>{JSON.stringify(item.analysis, null, 2)}</pre>}</section>)}{aiReport.errors.map((item) => <div className="error-panel" key={item.note_id}><CircleHelp size={18}/><div><strong>Analysis failed</strong><p>{notes.find((note) => note.id === item.note_id)?.summary || item.note_id}: {item.error}</p></div></div>)}<div className="modal-footer"><button className="button secondary" onClick={() => setAiReport(null)}>Close report</button></div></div></section></div>}

      {lightbox && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer"><button className="lightbox-close" onClick={() => setLightbox(null)} aria-label="Close image viewer"><X size={23}/></button><span className="lightbox-count">{lightbox.index + 1} / {lightbox.note.images.length}</span>{lightbox.note.images.length > 1 && <button className="lightbox-arrow prev" onClick={() => setLightbox((v) => v ? { ...v, index: (v.index - 1 + v.note.images.length) % v.note.images.length } : v)} aria-label="Previous image"><ChevronLeft size={27}/></button>}<img src={lightbox.note.images[lightbox.index].url} alt={`Business card ${lightbox.index + 1}`}/>{lightbox.note.images.length > 1 && <button className="lightbox-arrow next" onClick={() => setLightbox((v) => v ? { ...v, index: (v.index + 1) % v.note.images.length } : v)} aria-label="Next image"><ChevronRight size={27}/></button>}</div>}

      {deleteTarget && <div className="overlay top-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setDeleteTarget(null); }}><section className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><div className="confirm-icon"><Trash2 size={21}/></div><h2 id="delete-title">Delete this note?</h2><p>This will permanently delete the note and all {deleteTarget.images.length} associated {deleteTarget.images.length === 1 ? "image" : "images"}. This can't be undone.</p><div className="confirm-actions"><button className="button secondary" disabled={busy} onClick={() => setDeleteTarget(null)}>Keep note</button><button className="button danger" disabled={busy} onClick={() => void deleteNote()}>{busy ? "Deleting…" : "Delete permanently"}</button></div></section></div>}

      {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
      <button className="mobile-fab" onClick={openCreate} aria-label="Add note"><Plus size={23}/></button>
    </div>
  );
}

export default App;
