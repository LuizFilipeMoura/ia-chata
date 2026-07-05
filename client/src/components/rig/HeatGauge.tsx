import { useEffect, useRef } from "react";
import { heatMeter } from "/shared/game-state.js";
import type { Rig } from "../../state/types";

interface Props {
  rig: Rig;
  isActive: boolean;
  started: boolean;
  onCommand: (verb: string, attrs: Record<string, unknown>) => void;
}

// The heat gauge — the centrepiece control. A segmented thermometer that reads
// left-to-right up to the Rig's Heat Capacity (the redline), then into a red
// overheat zone. When hot, it spells out the exact misfire roll (§6) so the
// player knows precisely what's at stake. Controls are live only for the
// active Rig.
export function HeatGauge({ rig, isActive, started, onCommand }: Props) {
  const m = heatMeter(rig);
  const displayMax = m.cap + 4;
  const shownHeat = Math.min(m.heat, displayMax);

  // Mirror the tracker's prevHeat Map: remember the previously rendered heat so
  // we can flash the gauge up/down when it changes.
  const prevHeat = useRef<number | null>(null);
  const prior = prevHeat.current;
  useEffect(() => {
    prevHeat.current = m.heat;
  });

  const cls = ["heat-gauge"];
  if (!isActive) cls.push("heat-gauge--idle");
  if (prior != null && m.heat !== prior) {
    cls.push(m.heat > prior ? "heat-gauge--up" : "heat-gauge--down");
  }

  const segs = [];
  for (let i = 0; i < displayMax; i++) {
    const segCls = ["heat-seg"];
    if (i >= m.cap) segCls.push("heat-seg--danger");
    if (i === m.cap) segCls.push("heat-seg--redline"); // first overheat cell = the redline
    let style: React.CSSProperties | undefined;
    if (i < shownHeat) {
      segCls.push("heat-seg--on");
      // Warmth ramp across the safe zone: cool at the left, amber near the redline.
      style = { "--warm": (m.cap > 1 ? Math.min(1, i / (m.cap - 1)) : 1).toFixed(3) } as React.CSSProperties;
    }
    segs.push(<span key={i} className={segCls.join(" ")} style={style} />);
  }

  let statusBody;
  if (m.zone === "over") {
    statusBody = (
      <>
        <span className="heat-status-tag">▲ Overheating</span>
        <span className="heat-status-roll">misfire roll = D12 + {m.bonus}</span>
      </>
    );
  } else if (m.zone === "redline") {
    statusBody = (
      <>
        <span className="heat-status-tag">At redline</span>
        <span className="heat-status-sub">one more point triggers a misfire check</span>
      </>
    );
  } else if (m.zone === "cold") {
    statusBody = (
      <>
        <span className="heat-status-tag">Engine idle</span>
        <span className="heat-status-sub">cold — full {m.cap} of headroom</span>
      </>
    );
  } else {
    const room = m.cap - m.heat;
    statusBody = (
      <>
        <span className="heat-status-tag">{m.zone === "warm" ? "Running hot" : "Nominal"}</span>
        <span className="heat-status-sub">{room} heat to redline</span>
      </>
    );
  }

  const disabled = !isActive || started;
  const btn = (btnCls: string, text: string, aria: string, spec: string) => (
    <button
      type="button"
      className={`heat-btn ${btnCls}`}
      aria-label={aria}
      disabled={disabled}
      onClick={() => onCommand("heat", { name: rig.name, amount: spec })}
    >
      {text}
    </button>
  );

  return (
    <div className={cls.join(" ")} data-zone={m.zone}>
      <div className="heat-gauge-head">
        <span className="heat-gauge-label">Engine Heat</span>
        <span className="heat-gauge-read">
          <b>{m.heat}</b><span className="heat-gauge-cap">/{m.cap}</span>
        </span>
      </div>
      <div className="heat-track">{segs}</div>
      <div className="heat-status">
        {statusBody}
        {m.floor > 0 && (
          <span className="heat-status-lock">Engine wrecked · heat locked ≥ {m.floor}</span>
        )}
      </div>
      <div className="heat-controls">
        {btn("heat-btn-cool", "Shut Down", "Shut down — set heat to 0", "0")}
        {btn("heat-btn-vent", "Vent −2", "Vent — cool 2 heat", "-2")}
        {btn("heat-btn-minus", "−1", "Cool 1 heat", "-1")}
        {btn("heat-btn-plus", "＋1", "Add 1 heat", "+1")}
      </div>
      {!isActive && (
        <div className="heat-locked-hint">Set this Rig active to run its engine</div>
      )}
    </div>
  );
}
