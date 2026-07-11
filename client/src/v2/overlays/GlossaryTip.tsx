import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { glossaryById } from "../../lib/glossaryTerms";

interface Props {
  termId: string | null;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

// Native V2 port of V1 overlays/GlossaryTip. Positions the tooltip above the
// anchor when it fits, else below (adding `tip-below`), clamps horizontally
// within the viewport, and points the arrow at the anchor centre via `--arrow-x`.
// Retagged onto `v2-gloss-*` classes; rendered inside the provider's `.v2-root`
// portal wrapper.
export function GlossaryTip({ termId, anchorEl, onClose }: Props) {
  const tipRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [hidden, setHidden] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const entry = termId ? glossaryById(termId) : undefined;
  const open = Boolean(entry && anchorEl);

  const place = () => {
    const tip = tipRef.current;
    if (!tip || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const margin = 10;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;

    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));

    const fitsAbove = r.top - th - 12 >= margin;
    const top = fitsAbove ? r.top - th - 12 : r.bottom + 12;

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.classList.toggle("tip-below", !fitsAbove);
    const arrowX = Math.max(14, Math.min(r.left + r.width / 2 - left, tw - 14));
    tip.style.setProperty("--arrow-x", `${arrowX}px`);
  };

  // Open/close lifecycle. Opening only makes the tip renderable (clears
  // `hidden`) and marks the anchor; measuring/positioning waits for the
  // placement effect below, once the element is in layout. Closing fades out,
  // then drops it from layout after the transition.
  useLayoutEffect(() => {
    if (open) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setHidden(false);
      anchorEl?.classList.add("is-open");
    } else {
      setShow(false);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setHidden(true), 160);
    }
    return () => {
      if (open) anchorEl?.classList.remove("is-open");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, termId, anchorEl]);

  // Position only once the tip is in layout (`hidden` cleared) so offsetWidth/
  // offsetHeight are real. Reveal on the next frame so the fade-in still plays.
  useLayoutEffect(() => {
    if (!open || hidden) return;
    place();
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hidden, termId, anchorEl]);

  // Global handlers: outside-click closes, Escape closes, any scroll closes,
  // resize repositions. All torn down on unmount.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const tip = tipRef.current;
      if (!open || !tip) return;
      const target = e.target as Node;
      if (anchorEl && anchorEl.contains(target)) return;
      if (!tip.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    const onScroll = () => { if (open) onClose(); };
    const onResize = () => { if (open) place(); };

    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchorEl]);

  // Clear any pending hide timer on unmount so it can't fire post-teardown.
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  return (
    <div
      className={`v2-gloss-tip${show ? " show" : ""}`}
      role="tooltip"
      ref={tipRef}
      hidden={hidden}
    >
      <div className="v2-gloss-tip-term">{entry?.term ?? ""}</div>
      <div className="v2-gloss-tip-def">{entry?.def ?? ""}</div>
      <button className="v2-gloss-tip-close" type="button" aria-label="Close definition" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
