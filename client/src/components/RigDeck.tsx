import { Fragment } from "react";
import { useRoomState } from "../state/RoomStateContext";
import { useUi } from "../state/UiStateContext";
import { useCommands } from "../hooks/useCommands";
import { orderedRigs, ownerLabel } from "../lib/rigView";
import { RigItem } from "./rig/RigItem";
import { RigAddScreen } from "./RigAddScreen";

export function RigDeck() {
  const { rigs, game, session } = useRoomState();
  const { expandedRigs, activeRigId, toggleExpanded, setActiveRig } = useUi();
  const sendCommand = useCommands();
  const mySide = session?.side || "a";
  const started = Boolean(game?.started);
  const ordered = orderedRigs(rigs, mySide);

  let lastGroup: string | null = null;
  return (
    <div id="rigList" className="rig-list">
      {ordered.map((rig) => {
        const group = ownerLabel(rig.owner, mySide);
        const header = group !== lastGroup ? ((lastGroup = group), group) : null;
        const serverActive = started && game?.turn?.activeRigId === rig.id;
        const isActive = started ? serverActive : rig.id === activeRigId;
        const isOpen = expandedRigs.has(rig.id) || Boolean(serverActive);
        const isMine = (rig.owner || "a") === mySide;
        const pendingGate = Boolean(game?.pendingAnswer || game?.pendingReaction || game?.pendingBlast);
        const canActivateNow = Boolean(
          started && game?.phase === "activation" && game?.turn?.side === mySide &&
          isMine && game?.turn?.activeRigId == null && !pendingGate &&
          !rig.activated && !rig.destroyed,
        );
        return (
          <Fragment key={rig.id}>
            {header && (
              <div className="rig-group-head">
                {header === "Your Squadron" ? "Your Squadron" : "Enemy"}
              </div>
            )}
            <RigItem
              rig={rig}
              isActive={Boolean(isActive)}
              isOpen={isOpen}
              started={started}
              mySide={mySide}
              canActivateNow={canActivateNow}
              onCommand={sendCommand}
              onToggle={toggleExpanded}
              onActivateLocal={setActiveRig}
            />
          </Fragment>
        );
      })}
      {!started && <RigAddScreen />}
    </div>
  );
}
