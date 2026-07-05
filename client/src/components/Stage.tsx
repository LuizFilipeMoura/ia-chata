import { useRoomState } from "../state/RoomStateContext";
import { useUi } from "../state/UiStateContext";
import { RigDeck } from "./RigDeck";
import { BattleSetup } from "./BattleSetup";

export function Stage() {
  const { rigs } = useRoomState();
  const { activeRigId } = useUi();
  const active = rigs.find((r) => r.id === activeRigId);

  return (
    <main id="stage" className="stage">
      <div className="stage-head">
        <h1 id="rigDeckTitle">{active ? `Active · ${active.name}` : "Squadron Status"}</h1>
      </div>
      {/* BattleHud mounts here (Task 24) */}
      <RigDeck />
      <BattleSetup />
    </main>
  );
}
