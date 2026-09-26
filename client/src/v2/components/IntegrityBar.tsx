import { integrityTier } from "/shared/game-state.js";
import type { Rig } from "../../state/types";
import "../styles/integrity.css";

// Integrity (§8a): the whole-rig kill pool as one bar, coloured by danger tier.
// `ghost` previews an attack on it: the hatched band is the expected loss, the
// red tick the most it could take. LETHAL = the attack's best case empties the
// pool; LIKELY KILL = even the average does.
export function IntegrityBar({ rig, ghost, label = "Integrity", compact }: {
  rig: Rig;
  ghost?: { ed: number; max: number } | null;
  label?: string;
  compact?: boolean;
}) {
  if (!Number.isFinite(rig.integrity) || !rig.integrityMax) return null;
  const cur = Math.max(0, rig.integrity as number);
  const max = rig.integrityMax;
  const tier = integrityTier(rig);
  const pct = (v: number) => `${Math.max(0, Math.min(1, v / max)) * 100}%`;
  const ed = ghost ? Math.min(cur, ghost.ed) : 0;
  const top = ghost ? Math.min(cur, ghost.max) : 0;
  const lethal = !!ghost && ghost.max > 0 && ghost.max >= cur && cur > 0;
  const likely = lethal && !!ghost && ghost.ed >= cur;
  return (
    <span className={"v2-int" + (compact ? " v2-int--compact" : "")} data-tier={tier}>
      <span className="v2-int-head v2-eyebrow">
        <span>{label}</span>
        {tier === "bloodied" && <span className="v2-int-tag">BLOODIED</span>}
        {tier === "critical" && <span className="v2-int-tag v2-int-tag--crit">CRITICAL</span>}
        {lethal && <span className={"v2-int-lethal" + (likely ? " v2-int-lethal--likely" : "")}>{likely ? "☠ LIKELY KILL" : "☠ LETHAL"}</span>}
        <span className="v2-int-num">{cur}/{max}</span>
      </span>
      <span className="v2-int-track v2-well" role="meter" aria-label={`${label} ${cur} of ${max}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={cur}>
        <span className="v2-int-fill" style={{ width: pct(cur) }} />
        {ed > 0 && <span className="v2-int-ghost" style={{ left: pct(cur - ed), width: pct(ed) }} />}
        {top > 0 && <span className="v2-int-tick" style={{ left: pct(cur - top) }} />}
      </span>
      {ghost && (
        <span className="v2-int-note v2-text-sm">
          This attack ≈{ghost.ed.toFixed(1)}, up to {ghost.max}. At 0 it's wrecked.
        </span>
      )}
    </span>
  );
}
