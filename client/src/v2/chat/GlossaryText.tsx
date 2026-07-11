import { Fragment, type KeyboardEvent } from "react";
import { tokenizeGlossary } from "../../lib/glossaryTerms";
import { useV2GlossaryTip } from "../state/V2GlossaryTipContext";

// Native V2 port of V1 chat/GlossaryText. Renders plain text with recognised
// glossary terms wrapped in tappable controls that pop the definition tip via
// useV2GlossaryTip().showTip. Reuses the shared term-matching (tokenizeGlossary).
export function GlossaryText({ text }: { text: string }) {
  const { showTip } = useV2GlossaryTip();
  const segments = tokenizeGlossary(text);

  const onKeyDown = (id: string) => (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      showTip(id, e.currentTarget);
    }
  };

  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "term" && seg.id ? (
          <span
            key={i}
            className="v2-gloss-term"
            data-term={seg.id}
            role="button"
            tabIndex={0}
            aria-label={`${seg.term} — glossary term`}
            onClick={(e) => showTip(seg.id!, e.currentTarget)}
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
