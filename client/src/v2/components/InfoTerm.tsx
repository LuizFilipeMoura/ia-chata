import type { ElementType, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { glossaryById } from "../../lib/glossaryTerms";
import { useV2GlossaryTip } from "../state/V2GlossaryTipContext";

interface Props {
  /** Glossary id. Falsy or unknown → renders children as plain text (no affordance). */
  id?: string;
  /** Host tag; defaults to a span. */
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

// Wraps any structured UI token in a tappable control that pops its glossary
// definition via the existing tip (useV2GlossaryTip). Layers the `.v2-info`
// affordance onto whatever the host already looks like; degrades to inert text
// when the id has no entry, so an unmapped token never looks clickable.
export function InfoTerm({ id, as: Tag = "span", className = "", children }: Props) {
  const { showTip } = useV2GlossaryTip();
  const entry = id ? glossaryById(id) : undefined;

  if (!entry) {
    return <Tag className={className || undefined}>{children}</Tag>;
  }

  const open = (el: HTMLElement) => showTip(id!, el);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(e.currentTarget);
    }
  };

  return (
    <Tag
      className={`v2-info${className ? ` ${className}` : ""}`}
      data-info={id}
      role="button"
      tabIndex={0}
      aria-label={`${entry.term} — what this means`}
      onClick={(e: MouseEvent<HTMLElement>) => open(e.currentTarget)}
      onKeyDown={onKeyDown}
    >
      {children}
    </Tag>
  );
}
