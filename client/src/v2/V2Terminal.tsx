import { useState } from "react";
import { Shell } from "./components/Shell";
import { Squadron } from "./screens/Squadron";
import { TurnBanner } from "./components/TurnBanner";
import { ImpersonateChip } from "./components/ImpersonateChip";
import { RigTerminal } from "./overlays/RigTerminal";
import { CommissionWizard } from "./overlays/CommissionWizard";
import { OutcomeBanner } from "./overlays/OutcomeBanner";
import { V2ChatMount } from "./components/V2ChatMount";
import { GlossaryDialog } from "./overlays/GlossaryDialog";
import { useRoomState } from "../state/RoomStateContext";
import { useCommands } from "../hooks/useCommands";
import { useMySide } from "../hooks/useMySide";
import { useV2BattleWatchers } from "./hooks/useV2BattleWatchers";
import { useUi } from "../state/UiStateContext";

export function V2Terminal() {
  const { rigs, game } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const { chatOpen, setChatOpen, glossaryOpen, setGlossaryOpen } = useUi();
  const [openRigId, setOpenRigId] = useState<number | null>(null);
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(false);

  useV2BattleWatchers();

  const openRig = rigs.find((r) => r.id === openRigId) || null;
  const started = Boolean(game?.started);
  const pendingGate = Boolean(game?.pendingAnswer || game?.pendingReaction || game?.pendingBlast);
  // Whether it's this player's activation turn at all — distinct from whether
  // *this* rig can activate right now. "Wait for your turn" is only honest when
  // it is NOT my turn; on my turn a blocked rig shows no control instead.
  const myTurn = started && game?.phase === "activation" && game?.turn?.side === mySide;
  const canActivate =
    !!openRig && myTurn && (openRig.owner || "a") === mySide &&
    game?.turn?.activeRigId == null && !pendingGate &&
    !openRig.activated && !openRig.destroyed;

  return (
    <Shell
      channel="yard"
      onForge={() => setCommissionOpen(true)}
      onRulebook={() => setChatOpen(!chatOpen)}
      onGlossary={() => setGlossaryOpen(true)}
      chatUnread={chatUnread}
    >
      <ImpersonateChip />
      <TurnBanner onCommission={() => setCommissionOpen(true)} />
      <Squadron onOpenRig={setOpenRigId} onCommission={() => setCommissionOpen(true)} />
      {openRig && (
        <RigTerminal rig={openRig} started={started} canActivate={canActivate}
          mine={(openRig.owner || "a") === mySide} myTurn={myTurn}
          onCommand={sendCommand} onClose={() => setOpenRigId(null)} />
      )}
      {commissionOpen && <CommissionWizard onClose={() => setCommissionOpen(false)} />}
      <OutcomeBanner />
      <GlossaryDialog open={glossaryOpen} onClose={() => setGlossaryOpen(false)} />
      <V2ChatMount onUnreadChange={setChatUnread} />
    </Shell>
  );
}
