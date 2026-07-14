import { useEffect, useState } from "react";
import type { Rig } from "../../state/types";
import { rigEffects } from "/shared/game-state.js";
import { SPEED, holdMsFor } from "./constants";
import "../styles/overlay.css";

// Move and Sprint resolve on the tabletop, not on the device — the console can't
// see the model shift. So instead of firing the action the instant it's tapped,
// we hold the player on a timed drawer: the Confirm button stays locked for
// MOVE_HOLD_MS (long enough to actually push the Rig) before it unlocks. Cancel
// is live the whole time so a misclick isn't a trap (battle.js:349-426).
export default function MoveBody({
  rig, actionKey, enemies, onEngageChange, onCancel, onConfirm,
}: {
  rig: Rig;
  actionKey: string;
  enemies: Rig[];
  onEngageChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const sprint = actionKey === "sprint";
  // Per-chassis Speed wins; fall back to the weight-class map for support units,
  // free-combo rigs, and pre-speed saves.
  const base = rig.speed ?? SPEED[rig.weightClass] ?? 8;
  // Sprint is 1½× Speed, rounded to a whole inch so table measuring stays clean.
  const dist = sprint ? Math.round(base * 1.5) : base;
  // Sprint heat is engine-derived (Servo Actuators → 1, its Reinforced Servos
  // Field upgrade → 0); Move is always +1. Reading rigEffects keeps this drawer
  // identical to the picker chip and to what resolution charges.
  const heat = sprint ? rigEffects(rig).actionHeat.sprint : 1;
  const holdMs = holdMsFor(actionKey);
  const holdSec = Math.round(holdMs / 1000);

  const [remaining, setRemaining] = useState(holdSec);
  const [pct, setPct] = useState(0);
  const done = remaining <= 0;
  // Move and Sprint each spend one action slot; both generate heat (Move +1,
  // Sprint +2 / +1 with Servo Actuators). You may repeat them within the budget.
  const costNote = `Costs 1 action · +${heat} heat`;

  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - start;
      setPct(Math.min(1, elapsed / holdMs) * 100);
      if (elapsed >= holdMs) {
        setRemaining(0);
      } else {
        setRemaining(Math.ceil((holdMs - elapsed) / 1000));
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [holdMs]);

  return (
    <>
      <p
        className="v2-dwr-hint"
        dangerouslySetInnerHTML={{
          __html: sprint
            ? `Reposition up to <b>${dist}"</b> (1½× Speed). Backpedal / side-step at half; pivot up to 90° free. Generates <b>+${heat} heat</b>.`
            : `Reposition up to <b>${dist}"</b> (full Speed). Backpedal / side-step at half; pivot up to 90° free. Generates <b>+${heat} heat</b>.`,
        }}
      />
      <div className="v2-dwr-cost">{costNote}</div>
      <div className="v2-dwr-big-wrap">
        <div className={"v2-dwr-big" + (done ? " is-ready" : "")}>{done ? "READY" : `${remaining}s`}</div>
      </div>
      <div className="v2-dwr-hold-track">
        <div className={"v2-dwr-hold-fill" + (done ? " is-ready" : "")} style={{ width: `${pct}%` }} />
      </div>
      <p className={"v2-dwr-hint v2-dwr-move-call" + (done ? " is-ready" : "")}>
        {done ? "✔ Model placed? Confirm to lock in the move." : "Move the Rig on the table now, then confirm."}
      </p>
      {enemies.length > 0 && (
        <label className="v2-dwr-engage">
          <span className="v2-dwr-engage-label v2-eyebrow">Engage an enemy in reach (optional)</span>
          <select
            className="v2-dwr-engage-select"
            defaultValue=""
            onChange={(e) => onEngageChange(e.target.value)}
          >
            <option value="">— none —</option>
            {enemies.map((e) => (
              <option key={e.id} value={e.name}>{e.name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="v2-dwr-actions">
        <button type="button" className="v2-dwr-btn ghost" onClick={onCancel}>
          <span>Cancel</span>
        </button>
        <button type="button" className="v2-dwr-btn primary" disabled={!done} onClick={onConfirm}>
          <span>{done ? "Done — moved" : `Moving… ${remaining}s`}</span>
        </button>
      </div>
    </>
  );
}
