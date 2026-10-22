import { useState } from "react";
import { ArrowRight, CheckSquare, Clock3, Download, ImagePlus, MoreHorizontal, Pencil, Square, Trash2 } from "lucide-react";
import type { Note } from "../types";
import { dateLabel } from "../lib/format";

type NoteCardProps = {
  note: Note;
  selected: boolean;
  onSelect: () => void;
  onDownload: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export default function NoteCard({ note, selected, onSelect, onDownload, onOpen, onEdit, onDelete }: NoteCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const first = note.images[0];

  return (
    <article className={`note-card${selected ? " note-card-selected" : ""}`}>
      <button className="note-image-button" onClick={onOpen} aria-label="Open note">
        {first ? <img src={first.url} alt="Business card preview" loading="lazy" /> : <div className="image-fallback"><ImagePlus size={26} /></div>}
        {note.images.length > 1 && <span className="photo-count"><ImagePlus size={13} />{note.images.length}</span>}
        <span className="image-open"><ArrowRight size={16} /></span>
      </button>
      <button type="button" className={`note-select-button${selected ? " is-selected" : ""}`} onClick={onSelect} aria-label={selected ? "Deselect note" : "Select note"} aria-pressed={selected}>
        {selected ? <CheckSquare size={19} /> : <Square size={19} />}
      </button>
      <div className="note-card-body">
        <button className="note-text-button" onClick={onOpen}>
          <p className={note.summary ? "note-summary" : "note-summary placeholder-summary"}>{note.summary?.trim() || "Business cards"}</p>
        </button>
        <div className="note-meta">
          <span><Clock3 size={13} />{dateLabel(note.updated_at)}</span>
          <div className="note-menu-wrap">
            <button className="note-menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Note actions" aria-expanded={menuOpen}><MoreHorizontal size={18} /></button>
            {menuOpen && <>
              <button className="menu-dismiss" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
              <div className="note-menu">
                <button onClick={() => { setMenuOpen(false); onDownload(); }}><Download size={14} /> Download note</button>
                <button onClick={() => { setMenuOpen(false); onSelect(); }}>{selected ? <Square size={14} /> : <CheckSquare size={14} />} {selected ? "Deselect note" : "Select note"}</button>
                <button onClick={() => { setMenuOpen(false); onEdit(); }}><Pencil size={14} /> Edit note</button>
                <button className="danger-text" onClick={() => { setMenuOpen(false); onDelete(); }}><Trash2 size={14} /> Delete note</button>
              </div>
            </>}
          </div>
        </div>
      </div>
    </article>
  );
}
