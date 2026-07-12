import "../styles/rig-terminal.css";
import { heatMeter } from "/shared/game-state.js";
import { UNIT_KINDS, kindOf } from "/shared/unit-kinds.js";
import type { Rig } from "../../state/types";
import { InfoTerm } from "./InfoTerm";

// Read-only segmented thermometer — cap safe cells plus 4 overheat cells, with
// the redline at the first danger cell. Mirrors V1's HeatGauge logic (heatMeter);
// no stoke/vent controls (deferred). Hidden entirely for cold kinds.
export function HeatGauge({ rig }: { rig: Rig }) {
  if (!UNIT_KINDS[kindOf(rig)].hasHeat) return null;
  const m = heatMeter(rig);
  const displayMax = m.cap + 4;
  const shownHeat = Math.min(m.heat, displayMax);

  const segs = [];
  for (let i = 0; i < displayMax; i++) {
    const c = ["v2-heat-seg"];
    if (i >= m.cap) c.push("v2-heat-seg--danger");
    if (i === m.cap) c.push("v2-heat-seg--redline");
    if (i < shownHeat) c.push("v2-heat-seg--on");
    segs.push(<span key={i} className={c.join(" ")} />);
  }

  const note =
    m.zone === "over" ? `⚠ misfire roll = D12 + ${m.bonus}`
    : m.zone === "redline" ? "At redline — one more triggers a misfire check"
    : m.zone === "cold" ? `Cold — full ${m.cap} of headroom`
    : m.zone === "warm" ? `Running hot — ${m.cap - m.heat} to redline`
    : `Nominal — ${m.cap - m.heat} to redline`;

  return (
    <div className="v2-heat" data-zone={m.zone}>
      <div className="v2-heat-head">
        <InfoTerm id="heat" className="v2-heat-label v2-eyebrow">ENGINE HEAT</InfoTerm>
        <span className="v2-heat-read"><b>{m.heat}</b>/<InfoTerm id="heat-capacity">{m.cap}</InfoTerm></span>
      </div>
      <div className="v2-heat-track">{segs}</div>
      <div className="v2-heat-note">{note}</div>
      {m.floor > 0 && <div className="v2-heat-lock">Engine wrecked · heat locked ≥ {m.floor}</div>}
    </div>
  );
}
