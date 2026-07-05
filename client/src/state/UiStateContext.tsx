import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface UiState {
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  expandedRigs: Set<number>;
  toggleExpanded: (id: number) => void;
  activeRigId: number | null;
  setActiveRig: (id: number | null) => void;
}

const Ctx = createContext<UiState | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
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

  return (
    <Ctx.Provider value={{ chatOpen, setChatOpen, expandedRigs, toggleExpanded, activeRigId, setActiveRig }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUi(): UiState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUi outside UiProvider");
  return v;
}
