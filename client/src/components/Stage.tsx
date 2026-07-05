import { useRoomState } from "../state/RoomStateContext";
import { useUi } from "../state/UiStateContext";
import { RigDeck } from "./RigDeck";
import { FieldControls } from "./FieldControls";
import { BattleSetup } from "./BattleSetup";
import { BattleHud } from "./BattleHud";

export function Stage() {
  const { rigs } = useRoomState();
  const { activeRigId } = useUi();
  const active = rigs.find((r) => r.id === activeRigId);

  return (
    <main id="stage" className="stage">
      <div className="stage-head">
        <h1 id="rigDeckTitle">{active ? `Active · ${active.name}` : "Squadron Status"}</h1>
      </div>
      <BattleHud />
      <RigDeck />
      <FieldControls />
      <BattleSetup />
    </main>
  );
}
