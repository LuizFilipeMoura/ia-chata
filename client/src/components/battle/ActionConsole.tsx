import { availableActions, actionBudget } from "/shared/battle-view.js";
import { UNIT_KINDS, kindOf } from "/shared/unit-kinds.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useBattleActions, iconFor } from "../../state/BattleActionsContext";
import { useWizard } from "../../state/WizardContext";
import type { AttackMode } from "../wizards/AttackWizard";
import type { Rig } from "../../state/types";

interface Props {
  rig: Rig;
}

// The action console injected into the active rig's body (battle.js:275-329).
export function ActionConsole({ rig }: Props) {
  const { game } = useRoomState();
  const sendCommand = useCommands();
  const { openMove, openRepair, endActivation, openPrepare } = useBattleActions();
  const { openAttack } = useWizard();

  const t = game?.turn;
  // Render nothing unless this rig is the active one in the activation phase
  // (battle.js:280 returns an empty wrap).
  if (!t || t.activeRigId !== rig.id || game?.phase !== "activation") {
    return <div className="action-console" />;
  }

  const onAction = (r: Rig, key: string) => {
    if (key === "fire" || key === "aimed") {
      openAttack(r, key as AttackMode);
      return;
    }
    if (key === "move" || key === "sprint") {
      openMove(r, key);
      return;
    }
    if (key === "repair") {
      openRepair(r, "repair");
      return;
    }
    if (key === "emergencypatch") {
      openRepair(r, "emergencypatch");
      return;
    }
    if (key === "prepare") {
      openPrepare(r);
      return;
    }
    sendCommand("action", { name: r.name, action: key });
  };

  const b = actionBudget(rig, t);
  const actions = availableActions(rig, t);
  // Cold kinds (Tank / Walker) don't track heat — suppress per-action heat tags.
  const cold = !UNIT_KINDS[kindOf(rig)].hasHeat;

  // Surface the "why" behind constrained actions as inline hints, deduplicated.
  const notes = [...new Set(actions.map((a) => a.note).filter(Boolean))] as string[];

  return (
    <div className="action-console">
      <div className="ac-budget">
        <span className="ac-budget-label">
          Actions {b.left}/{b.max}
          {b.reduced ? (
            <>
              {" · "}
              <span className="ac-reduced">Hull damage −2</span>
            </>
          ) : null}
        </span>
        <div className="ac-pips">
          {Array.from({ length: Math.max(3, b.max) }, (_, i) => (
            <span
              key={i}
              className={"ac-pip" + (i < b.used ? " spent" : i >= b.max ? " locked" : "")}
            />
          ))}
        </div>
      </div>

      <div className="ac-grid">
        {actions.map((act) => {
          const heatLabel =
            act.heat > 0 ? `+${act.heat} heat` : act.heat < 0 ? `${act.heat} heat` : "0 heat";
          return (
            <button
              key={act.key}
              type="button"
              className="ac-btn"
              disabled={!act.enabled}
              title={act.note || undefined}
              data-note={act.note ? "1" : undefined}
              onClick={() => onAction(rig, act.key)}
            >
              <span className="ac-ic" aria-hidden="true">{iconFor(act.key)}</span>
              <span className="ac-label">{act.label}</span>
              {!cold && <span className="ac-heat" data-heat={act.heat}>{heatLabel}</span>}
            </button>
          );
        })}
      </div>

      {notes.slice(0, 2).map((note, i) => (
        <p
          key={i}
          className={"hint" + (/spent|no\s|already|can'?t|locked/i.test(note) ? " hint--warn" : "")}
        >
          {note}
        </p>
      ))}

      <button className="bh-btn ac-end ghost" type="button" onClick={() => endActivation(rig)}>
        End Activation
      </button>
    </div>
  );
}
