import { canAddRigForSide, MAX_RIGS_TOTAL, MAX_RIGS_PER_SIDE } from "/shared/game-state.js";
import { useRoomState } from "../state/RoomStateContext";
import { useWizard } from "../state/WizardContext";

interface Props {
  onCommission?: () => void;
}

export function RigAddScreen({ onCommission }: Props) {
  const { rigs, game, session } = useRoomState();
  const { openCommission } = useWizard();
  const owner = session?.side || "a";
  const canAdd = canAddRigForSide({ rigs, game }, owner);

  const sideRigCount = rigs.filter((rig) => (rig.owner || "a") === owner).length;

  let message = "";
  if (rigs.length >= MAX_RIGS_TOTAL) message = `Roster full: ${MAX_RIGS_TOTAL} rigs are already in place.`;
  else if (sideRigCount >= MAX_RIGS_PER_SIDE) message = `Side full: ${MAX_RIGS_PER_SIDE} rigs are already assigned.`;

  // First-run empty state: when this side has no Rigs yet, the commission card
  // grows into a centered "start here" call rather than a quiet footer button.
  const isEmpty = sideRigCount === 0 && !Boolean(game?.started);

  const cardCls =
    "rig-add-card" + (isEmpty ? " is-empty" : "") + (!canAdd ? " rig-add-locked" : "");

  // Locked (lineup full) keeps the card a visible affordance rather than a
  // dimmed disabled button, but its click is inert: the "↑" is a signpost to
  // the real Ready control in the battle-setup bar, not a second entry point.
  const hint = !canAdd
    ? "Full lineup of 3 committed — mark ready to deploy."
    : isEmpty
      ? "Commission your first Rig to begin — name it, pick a weight class and weapons."
      : "Name it, pick a weight class and weapons, then choose its equipment.";

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
            title={canAdd ? undefined : message}
            onClick={canAdd ? () => (onCommission ?? openCommission)() : () => {}}
          >
            {canAdd ? "+ Commission" : "Ready up ↑"}
          </button>
        </div>
      </div>
    </div>
  );
}
