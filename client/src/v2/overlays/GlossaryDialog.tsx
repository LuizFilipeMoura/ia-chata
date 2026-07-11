import { useEffect } from "react";
import { GLOSSARY } from "/shared/glossary.js";
import "../styles/glossary.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

// Native V2 port of V1 overlays/GlossaryDialog — the browse-all modal listing
// every shared glossary entry. Rendered inside the Shell's `.v2-root`, so the
// scoped `v2-gloss-*` styles apply directly (no portal wrapper needed).
export function GlossaryDialog({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="v2-gloss-dialog-scrim" onClick={onClose}>
      <div className="v2-gloss-dialog" role="dialog" aria-modal="true" aria-label="Glossary" onClick={(e) => e.stopPropagation()}>
        <div className="v2-gloss-dialog-head">
          <div className="v2-gloss-dialog-title">ⓘ Glossary</div>
          <button type="button" className="v2-gloss-dialog-close" onClick={onClose} aria-label="Close glossary">✕</button>
        </div>
        {GLOSSARY.map((g) => (
          <div className="v2-gloss-entry" key={g.id}>
            <div className="v2-gloss-entry-hd">
              <span className="v2-gloss-entry-term">{g.term}</span>
            </div>
            <div className="v2-gloss-entry-def">{g.def}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
