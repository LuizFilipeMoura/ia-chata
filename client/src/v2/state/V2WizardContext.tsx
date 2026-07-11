import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AttackWizard, type AttackMode } from "../overlays/AttackWizard";
import { VpWizard } from "../overlays/VpWizard";
import { useRoomState } from "../../state/RoomStateContext";
import type { Rig } from "../../state/types";

export interface AttackOpts {
  target?: string;
  react?: boolean;
}

interface WizardApi {
  openAttack: (rig: Rig, mode: AttackMode, opts?: AttackOpts) => void;
  openScore: () => void;
  close: () => void;
}

type Open =
  | { kind: "attack"; rig: Rig; mode: AttackMode; opts?: AttackOpts }
  | { kind: "score" }
  | null;

const Ctx = createContext<WizardApi | null>(null);

// Native V2 port of V1's WizardProvider, trimmed to the two combat overlays it
// still owns (targeting + scoring). Commission lives in V2Terminal, so there is
// no openCommission here. The portaled overlays wrap their own `.v2-root`.
export function V2WizardProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null);
  const { rigs } = useRoomState();

  // Keep the rig list current inside the stable openAttack callback.
  const rigsRef = useRef(rigs);
  rigsRef.current = rigs;

  const openAttack = useCallback((rig: Rig, mode: AttackMode, opts?: AttackOpts) => {
    // enemies = opposing, non-destroyed rigs; if none, don't open (attack-wizard.js:44-45).
    const enemies = rigsRef.current.filter(
      (r) => (r.owner || "a") !== (rig.owner || "a") && !r.destroyed,
    );
    if (!enemies.length) return;
    setOpen({ kind: "attack", rig, mode, opts });
  }, []);
  const openScore = useCallback(() => setOpen({ kind: "score" }), []);
  const close = useCallback(() => setOpen(null), []);

  return (
    <Ctx.Provider value={{ openAttack, openScore, close }}>
      {children}
      {open?.kind === "attack" &&
        createPortal(
          <AttackWizard
            rig={open.rig}
            mode={open.mode}
            target={open.opts?.target}
            react={open.opts?.react}
            onClose={close}
          />,
          document.body,
        )}
      {open?.kind === "score" &&
        createPortal(<VpWizard onClose={close} />, document.body)}
    </Ctx.Provider>
  );
}

export function useV2Wizard(): WizardApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useV2Wizard outside V2WizardProvider");
  return v;
}
