import { useState } from "react";
import { Shell } from "./components/Shell";
import { Squadron } from "./screens/Squadron";
import { RigTerminal } from "./overlays/RigTerminal";
import { CommissionWizard } from "./overlays/CommissionWizard";
import { useRoomState } from "../state/RoomStateContext";
import { useCommands } from "../hooks/useCommands";
import { useMySide } from "../hooks/useMySide";

export function V2Terminal() {
  const { rigs, game } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const [openRigId, setOpenRigId] = useState<number | null>(null);
  const [commissionOpen, setCommissionOpen] = useState(false);

  const openRig = rigs.find((r) => r.id === openRigId) || null;
  const started = Boolean(game?.started);
  const pendingGate = Boolean(game?.pendingAnswer || game?.pendingReaction || game?.pendingBlast);
  const canActivate =
    !!openRig && started && game?.phase === "activation" && game?.turn?.side === mySide &&
    (openRig.owner || "a") === mySide && game?.turn?.activeRigId == null && !pendingGate &&
    !openRig.activated && !openRig.destroyed;

  return (
    <Shell channel="yard" onForge={() => setCommissionOpen(true)}>
      <Squadron onOpenRig={setOpenRigId} onCommission={() => setCommissionOpen(true)} />
      {openRig && (
        <RigTerminal rig={openRig} started={started} canActivate={canActivate}
          onCommand={sendCommand} onClose={() => setOpenRigId(null)} />
      )}
      {commissionOpen && <CommissionWizard onClose={() => setCommissionOpen(false)} />}
    </Shell>
  );
}
