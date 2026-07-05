import { barClass } from "../../lib/rigView";
import type { Rig, Loc } from "../../state/types";

interface Props { rig: Rig; loc: Loc; onCommand: (verb: string, attrs: Record<string, unknown>) => void }

export function CompRow({ rig, loc, onCommand }: Props) {
  const c = rig[loc];
  const label = loc.charAt(0).toUpperCase() + loc.slice(1);
  const text = c.destroyed ? "DESTROYED" : c.sp === 0 ? "CATASTROPHIC" : `${c.sp}/${c.max}`;
  return (
    <div className="rig-comp">
      <span className="rig-comp-label">{label}</span>
      <button className="rig-step" type="button" aria-label={`Damage ${loc}`}
        onClick={() => onCommand("damage", { name: rig.name, loc, amount: "1" })}>−</button>
      <div className="rig-bar">
        <div className={`rig-bar-fill ${barClass(c)}`} style={{ width: `${Math.round((c.sp / c.max) * 100)}%` }} />
        <div className="rig-bar-text">{text}</div>
      </div>
      <button className="rig-step" type="button" aria-label={`Repair ${loc}`}
        onClick={() => onCommand("repair", { name: rig.name, loc, amount: "1" })}>＋</button>
    </div>
  );
}
