import { Fragment, type KeyboardEvent } from "react";
import { tokenizeGlossary } from "../../lib/glossaryTerms";
import { useGlossaryTip } from "../../state/GlossaryTipContext";

// Renders plain text with recognised glossary terms wrapped in tappable spans.
// Attributes mirror public/js/glossary.js (highlightGlossary).
export function GlossaryText({ text }: { text: string }) {
  const { openTip } = useGlossaryTip();
  const segments = tokenizeGlossary(text);

  const onKeyDown = (id: string) => (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openTip(id, e.currentTarget);
    }
  };

  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "term" && seg.id ? (
          <span
            key={i}
            className="glossary-term"
            data-term={seg.id}
            role="button"
            tabIndex={0}
            aria-label={`${seg.term} — glossary term`}
            onClick={(e) => openTip(seg.id!, e.currentTarget)}
            onKeyDown={onKeyDown(seg.id)}
          >
            {seg.text}
          </span>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </>
  );
}
