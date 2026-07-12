import { useRoomState } from "../state/RoomStateContext";
import { useWizard } from "../state/WizardContext";
import { useMySide } from "../hooks/useMySide";

interface Props {
  onCommission?: () => void;
}

export function RigAddScreen({ onCommission }: Props) {
  const { rigs, game } = useRoomState();
  const { openCommission } = useWizard();
  const owner = useMySide();

  const sideRigCount = rigs.filter((rig) => (rig.owner || "a") === owner).length;

  // First-run empty state: when this side has no Rigs yet, the commission card
  // grows into a centered "start here" call rather than a quiet footer button.
  const isEmpty = sideRigCount === 0 && !Boolean(game?.started);

  const cardCls = "rig-add-card" + (isEmpty ? " is-empty" : "");

  const hint = isEmpty
    ? "Commission your first Rig to begin — name it, pick a chassis and its weapon upgrades."
    : "Name it, pick a chassis and weapon upgrades, then choose its equipment.";

  return (
    <div id="rigAddScreen" className={cardCls}>
      <div className="rig-add">
        <div className="rig-add-title">{isEmpty ? "◈ Your squadron is empty" : "◈ Commission a Rig"}</div>
        <div className="rig-add-hint">{hint}</div>
        <div className="rig-add-row">
          <button
            id="rigAddBtn"
            className="rig-add-btn btn btn--primary"
            type="button"
            onClick={() => (onCommission ?? openCommission)()}
          >
            + Commission
          </button>
        </div>
      </div>
    </div>
  );
}
