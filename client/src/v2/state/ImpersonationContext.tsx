import { createContext, useContext, useState, type ReactNode } from "react";
import { ViewSideContext } from "../../state/ViewSideContext";

interface Impersonation {
  actingSide: string | undefined;
  setActingSide: (side: string | undefined) => void;
}

const ImpersonationCtx = createContext<Impersonation | null>(null);

// Makes the app-wide ViewSideContext override runtime-switchable. Because
// useMySide() reads ViewSideContext and the whole app routes both view and
// command `side` through useMySide, flipping actingSide impersonates that side
// everywhere. Default undefined = act as your real session side.
export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [actingSide, setActingSide] = useState<string | undefined>(undefined);
  return (
    <ImpersonationCtx.Provider value={{ actingSide, setActingSide }}>
      <ViewSideContext.Provider value={actingSide}>{children}</ViewSideContext.Provider>
    </ImpersonationCtx.Provider>
  );
}

export function useImpersonation(): Impersonation {
  const v = useContext(ImpersonationCtx);
  if (!v) throw new Error("useImpersonation outside ImpersonationProvider");
  return v;
}
