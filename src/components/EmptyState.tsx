import { Plus } from "lucide-react";

type EmptyStateProps = {
  searching: boolean;
  onCreate: () => void;
  onClear: () => void;
};

export default function EmptyState({ searching, onCreate, onClear }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-art"><div className="empty-card card-back" /><div className="empty-card card-front"><div className="empty-card-top" /><div className="empty-card-line long" /><div className="empty-card-line" /><div className="empty-card-line short" /></div><div className="empty-plus"><Plus size={18} /></div></div>
      <p className="eyebrow">{searching ? "NOT FOUND" : "A FRESH START"}</p>
      <h2>{searching ? "No notes found" : "Your next great connection starts here."}</h2>
      <p className="muted">{searching ? "Try a different search or clear your query." : "Save your first business card and keep the details that matter close."}</p>
      {searching ? <button className="button secondary" onClick={onClear}>Clear search</button> : <button className="button primary" onClick={onCreate}><Plus size={17} /> Add your first note</button>}
    </div>
  );
}
