import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RigWizard } from "../components/wizards/RigWizard";
import { AttackWizard, type AttackMode } from "../components/wizards/AttackWizard";
import { VpWizard } from "../components/wizards/VpWizard";
import { useRoomState } from "./RoomStateContext";
import type { Rig } from "./types";

export interface AttackOpts {
  target?: string;
  react?: boolean;
}

interface WizardApi {
  openCommission: () => void;
  openAttack: (rig: Rig, mode: AttackMode, opts?: AttackOpts) => void;
  openScore: () => void;
  close: () => void;
}

type Open =
  | { kind: "commission" }
  | { kind: "attack"; rig: Rig; mode: AttackMode; opts?: AttackOpts }
  | { kind: "score" }
  | null;

const Ctx = createContext<WizardApi | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null);
  const { rigs } = useRoomState();

  // Keep the rig list current inside the stable openAttack callback.
  const rigsRef = useRef(rigs);
  rigsRef.current = rigs;

  const openCommission = useCallback(() => setOpen({ kind: "commission" }), []);
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
    <Ctx.Provider value={{ openCommission, openAttack, openScore, close }}>
      {children}
      {open?.kind === "commission" &&
        createPortal(<RigWizard onClose={close} />, document.body)}
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

export function useWizard(): WizardApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWizard outside WizardProvider");
  return v;
}
