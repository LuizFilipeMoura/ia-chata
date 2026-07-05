import { createContext, useContext, useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RigWizard } from "../components/wizards/RigWizard";
import { AttackWizard, type AttackMode } from "../components/wizards/AttackWizard";
import type { Rig } from "./types";

interface WizardApi {
  openCommission: () => void;
  openAttack: (rig: Rig, mode: AttackMode) => void;
  close: () => void;
}

type Open =
  | { kind: "commission" }
  | { kind: "attack"; rig: Rig; mode: AttackMode }
  | null;

const Ctx = createContext<WizardApi | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null);

  const openCommission = useCallback(() => setOpen({ kind: "commission" }), []);
  const openAttack = useCallback((rig: Rig, mode: AttackMode) => {
    // enemies = opposing, non-destroyed rigs; if none, don't open (attack-wizard.js:44-45).
    setOpen({ kind: "attack", rig, mode });
  }, []);
  const close = useCallback(() => setOpen(null), []);

  return (
    <Ctx.Provider value={{ openCommission, openAttack, close }}>
      {children}
      {open?.kind === "commission" &&
        createPortal(<RigWizard onClose={close} />, document.body)}
      {open?.kind === "attack" &&
        createPortal(
          <AttackWizard rig={open.rig} mode={open.mode} onClose={close} />,
          document.body,
        )}
    </Ctx.Provider>
  );
}

export function useWizard(): WizardApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWizard outside WizardProvider");
  return v;
}
