import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GlossaryTip } from "../components/overlays/GlossaryTip";
import { glossaryById } from "../lib/glossaryTerms";

interface GlossaryTipApi {
  openTip: (termId: string, anchorEl: HTMLElement) => void;
  closeTip: () => void;
}

const Ctx = createContext<GlossaryTipApi | null>(null);

export function GlossaryTipProvider({ children }: { children: ReactNode }) {
  const [termId, setTermId] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const openTip = useCallback((id: string, el: HTMLElement) => {
    if (!glossaryById(id)) return; // resolve entry; if none, don't open
    setTermId(id);
    setAnchorEl(el);
  }, []);

  const closeTip = useCallback(() => {
    setTermId(null);
    setAnchorEl(null);
  }, []);

  return (
    <Ctx.Provider value={{ openTip, closeTip }}>
      {children}
      {createPortal(
        <GlossaryTip termId={termId} anchorEl={anchorEl} onClose={closeTip} />,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export function useGlossaryTip(): GlossaryTipApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGlossaryTip outside GlossaryTipProvider");
  return v;
}
