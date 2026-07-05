import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";

interface UiState {
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  glossaryOpen: boolean;
  setGlossaryOpen: (v: boolean) => void;
  expandedRigs: Set<number>;
  toggleExpanded: (id: number) => void;
  activeRigId: number | null;
  setActiveRig: (id: number | null) => void;
}

const Ctx = createContext<UiState | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [expandedRigs, setExpanded] = useState<Set<number>>(new Set());
  const [activeRigId, setActiveRigId] = useState<number | null>(null);

  const toggleExpanded = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const setActiveRig = useCallback((id: number | null) => {
    setActiveRigId(id);
    if (id != null) setExpanded((prev) => new Set(prev).add(id));
  }, []);

  const value = useMemo(
    () => ({
      chatOpen, setChatOpen, glossaryOpen, setGlossaryOpen,
      expandedRigs, toggleExpanded, activeRigId, setActiveRig,
    }),
    [chatOpen, glossaryOpen, expandedRigs, activeRigId, setChatOpen, setGlossaryOpen, toggleExpanded, setActiveRig],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}

export function useUi(): UiState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUi outside UiProvider");
  return v;
}
