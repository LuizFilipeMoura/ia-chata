import { useState } from "react";
import { availableActions, actionBudget } from "/shared/battle-view.js";
import { UNIT_KINDS, kindOf } from "/shared/unit-kinds.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useBattleActions } from "../../state/BattleActionsContext";
import { useWizard } from "../../state/WizardContext";
import { IronActionTile } from "../dieselpunk/IronActionTile";
import type { AttackMode } from "../wizards/AttackWizard";
import type { Rig } from "../../state/types";

interface Props {
  rig: Rig;
}

interface Action {
  key: string;
  label: string;
  heat: number;
  enabled: boolean;
  cost: number;
  note: string;
}

// Three tactile groups collapse the full action list into one row. Each tile
// opens a popover of its enabled sub-actions (unless only one, which fires
// straight through). `kind` picks the dieselpunk chrome (pushbutton/joystick/knob).
const GROUPS: { id: string; label: string; kind: string; keys: string[] }[] = [
  { id: "attack", label: "Attack", kind: "fire", keys: ["fire", "aimed", "reload"] },
  { id: "move", label: "Move", kind: "move", keys: ["move", "sprint"] },
  { id: "support", label: "Support", kind: "repair", keys: [] }, // catch-all
];

const heatText = (heat: number) =>
  heat > 0 ? `+${heat} heat` : heat < 0 ? `${heat} heat` : "free";

// The action console injected into the active rig's body (battle.js:275-329).
export function ActionConsole({ rig }: Props) {
  const { game } = useRoomState();
  const sendCommand = useCommands();
  const { openMove, openRepair, endActivation, openPrepare } = useBattleActions();
  const { openAttack } = useWizard();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const t = game?.turn;
  // Render nothing unless this rig is the active one in the activation phase
  // (battle.js:280 returns an empty wrap).
  if (!t || t.activeRigId !== rig.id || game?.phase !== "activation") {
    return <div className="action-console" />;
  }

  const onAction = (r: Rig, key: string) => {
    setOpenGroup(null);
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
  const actions = availableActions(rig, t) as Action[];
  // Cold kinds (Tank / Walker) don't track heat — suppress per-action heat tags.
  const cold = !UNIT_KINDS[kindOf(rig)].hasHeat;

  const claimed = new Set(GROUPS.flatMap((g) => g.keys));
  const childrenFor = (g: (typeof GROUPS)[number]) =>
    g.id === "support"
      ? actions.filter((a) => !claimed.has(a.key))
      : actions.filter((a) => g.keys.includes(a.key));

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

      <div className="ac-grid ac-grid--groups">
        {GROUPS.map((g) => {
          const kids = childrenFor(g);
          if (kids.length === 0) return null;
          const enabledKids = kids.filter((a) => a.enabled);
          const groupEnabled = enabledKids.length > 0;
          const open = openGroup === g.id;

          const onGroup = () => {
            if (!groupEnabled) return;
            if (enabledKids.length === 1) onAction(rig, enabledKids[0].key);
            else setOpenGroup(open ? null : g.id);
          };

          return (
            <div className="ac-cell" key={g.id}>
              <IronActionTile
                asset={g.kind === "fire" ? "fire" : "lever"}
                label={g.label}
                lamp={g.kind === "fire"}
                disabled={!groupEnabled}
                open={open}
                hasPopup={enabledKids.length > 1}
                onClick={onGroup}
              />

              {open && (
                <>
                  <div className="ac-pop-scrim" onClick={() => setOpenGroup(null)} />
                  <div className="ac-pop" role="menu">
                    {kids.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        role="menuitem"
                        className="ac-pop-row"
                        disabled={!a.enabled}
                        title={a.note || undefined}
                        onClick={() => onAction(rig, a.key)}
                      >
                        <span className="ac-pop-label">{a.label}</span>
                        {!cold && (
                          <span className="ac-pop-heat" data-heat={a.heat}>{heatText(a.heat)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
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
        End {rig.name}'s turn
      </button>
    </div>
  );
}
