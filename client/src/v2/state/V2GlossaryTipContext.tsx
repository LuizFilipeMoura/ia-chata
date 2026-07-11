import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GlossaryTip } from "../overlays/GlossaryTip";
import { glossaryById } from "../../lib/glossaryTerms";
import "../styles/glossary.css";

interface V2GlossaryTipApi {
  showTip: (termId: string, anchorEl: HTMLElement) => void;
  hideTip: () => void;
}

const Ctx = createContext<V2GlossaryTipApi | null>(null);

// Native V2 port of V1's GlossaryTipContext. Holds the currently-open term +
// anchor and portals the V2 GlossaryTip to <body>. The portal wrapper carries
// `.v2-root` so the scoped `--v2-*` tokens (and `.v2-gloss-*` rules) resolve,
// but is neutralised to `display:contents` via the shared `.v2-portal` primitive
// (tokens.css) so this always-mounted wrapper never paints the opaque full-screen
// `.v2-root` background over the app — the tip is a non-modal popover, not a
// takeover like Drawer/RollConsole.
export function V2GlossaryTipProvider({ children }: { children: ReactNode }) {
  const [termId, setTermId] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const showTip = useCallback((id: string, el: HTMLElement) => {
    if (!glossaryById(id)) return; // resolve entry; if none, don't open
    setTermId(id);
    setAnchorEl(el);
  }, []);

  const hideTip = useCallback(() => {
    setTermId(null);
    setAnchorEl(null);
  }, []);

  return (
    <Ctx.Provider value={{ showTip, hideTip }}>
      {children}
      {createPortal(
        <div className="v2-root v2-portal">
          <GlossaryTip termId={termId} anchorEl={anchorEl} onClose={hideTip} />
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export function useV2GlossaryTip(): V2GlossaryTipApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useV2GlossaryTip outside V2GlossaryTipProvider");
  return v;
}
