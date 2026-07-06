import { useEffect, useRef } from "react";
import { barClass } from "../../lib/rigView";
import type { Rig, Loc } from "../../state/types";

interface Props { rig: Rig; loc: Loc; onCommand: (verb: string, attrs: Record<string, unknown>) => void }

export function CompRow({ rig, loc, onCommand }: Props) {
  const c = rig[loc];
  const label = loc.charAt(0).toUpperCase() + loc.slice(1);
  const text = c.destroyed ? "DESTROYED" : c.sp === 0 ? "CATASTROPHIC" : `${c.sp}/${c.max}`;

  // Remember the last structure so a change flashes the bar: a red shake on a
  // hit, a green pulse on a repair, with a floating ∓N so it's easy to track.
  // Purely presentational — this reads server state, it never changes it.
  const prevSp = useRef<number | null>(null);
  const prior = prevSp.current;
  useEffect(() => { prevSp.current = c.sp; });
  const damaged = prior != null && c.sp < prior;
  const healed = prior != null && c.sp > prior;
  const delta = prior != null ? Math.abs(c.sp - prior) : 0;

  const rowCls = ["rig-comp"];
  if (damaged) rowCls.push("rig-comp--hit");
  else if (healed) rowCls.push("rig-comp--heal");

  return (
    <div className={rowCls.join(" ")}>
      <span className="rig-comp-label">{label}</span>
      <button className="rig-step" type="button" aria-label={`Damage ${loc}`}
        onClick={() => onCommand("damage", { name: rig.name, loc, amount: "1" })}>−</button>
      <div className="rig-bar">
        <div className={`rig-bar-fill ${barClass(c)}`} style={{ width: `${Math.round((c.sp / c.max) * 100)}%` }} />
        <div className="rig-bar-text">{text}</div>
      </div>
      <button className="rig-step" type="button" aria-label={`Repair ${loc}`}
        onClick={() => onCommand("repair", { name: rig.name, loc, amount: "1" })}>＋</button>
      {(damaged || healed) && (
        <span className={"rig-comp-delta " + (damaged ? "is-hit" : "is-heal")} aria-hidden="true">
          {damaged ? "−" : "+"}{delta}
        </span>
      )}
    </div>
  );
}
