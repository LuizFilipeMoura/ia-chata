import { GLOSSARY } from "/shared/glossary.js";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function GlossaryDialog({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="gloss-dialog-scrim" onClick={onClose}>
      <div className="gloss-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="gloss-dialog-head">
          <div className="gloss-dialog-title">ⓘ Glossary</div>
          <button type="button" className="gloss-dialog-close" onClick={onClose} aria-label="Close glossary">✕</button>
        </div>
        {GLOSSARY.map((g) => (
          <div className="gloss-entry" key={g.id}>
            <div className="gloss-entry-hd">
              <span className="gloss-entry-term">{g.term}</span>
            </div>
            <div className="gloss-entry-def">{g.def}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
