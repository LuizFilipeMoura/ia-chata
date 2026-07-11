import "../styles/squadron.css";
import { heatMeter } from "/shared/game-state.js";
import { kindOf, partNamesOf, UNIT_KINDS } from "/shared/unit-kinds.js";
import { buildLoadout } from "../../lib/loadout";
import { spColor } from "../lib/viewModels";
import type { Rig, Component } from "../../state/types";

const CLASS_GLYPH: Record<string, [string, string, string]> = {
  light: ["◆", "LGT", "#8fbcff"], medium: ["◈", "MED", "#e8bd57"],
  heavy: ["⬢", "HVY", "#ef9450"], colossal: ["✦", "COL", "#f26a50"],
};

function loadoutText(rig: Rig): string {
  const lo = buildLoadout(rig);
  if (!lo) return "";
  if (lo.flat) return lo.unit?.name ?? "";
  return [lo.lr?.name, lo.melee?.name].filter(Boolean).join(" · ");
}

export function RigRow({ rig, hostile, onOpen }: { rig: Rig; hostile: boolean; onOpen: (id: number) => void }) {
  const locs: string[] = partNamesOf(kindOf(rig));
  const [glyph, short, color] = CLASS_GLYPH[rig.weightClass] ?? CLASS_GLYPH.light;
  const cold = !UNIT_KINDS[kindOf(rig)].hasHeat;
  const m = cold ? null : heatMeter(rig);
  const statusColor = rig.destroyed ? "#f26a50" : "#6cc47f";

  return (
    <button
      type="button"
      className={"v2-rigrow" + (hostile ? " v2-rigrow--hostile" : "")}
      onClick={() => onOpen(rig.id)}
    >
      <span className={"v2-rigrow-stripe" + (hostile ? " v2-hazard" : "")} />
      <span className="v2-rigrow-class" style={{ color }}>
        <span className="v2-rigrow-glyph">{glyph}</span>
        <span className="v2-rigrow-short v2-eyebrow">{short}</span>
      </span>
      <span className="v2-rigrow-main">
        <span className="v2-rigrow-head">
          <span className="v2-rigrow-name v2-title">{rig.name}</span>
          {rig.activated && !hostile && <span className="v2-rigrow-badge">ACTIVE</span>}
          {!cold && m && <span className="v2-rigrow-heat" data-zone={m.zone}>🔥{m.heat}</span>}
        </span>
        <span className="v2-rigrow-loadout">{loadoutText(rig)}</span>
        <span className="v2-rigrow-bars">
          {locs.map((loc) => {
            const c = (rig as unknown as Record<string, Component | undefined>)[loc];
            if (!c) return null;
            const tag = loc[0].toUpperCase();
            return (
              <span key={loc} className="v2-rigrow-bar">
                <span className="v2-rigrow-bar-head v2-eyebrow">
                  <span>{tag}</span><span>{c.sp}/{c.max}</span>
                </span>
                <span className="v2-rigrow-bar-track v2-well">
                  <span className="v2-rigrow-bar-fill"
                    style={{ width: `${Math.max(0, Math.round((c.sp / c.max) * 100))}%`, background: spColor(c.sp, c.max) }} />
                </span>
              </span>
            );
          })}
        </span>
      </span>
      <span className="v2-rigrow-status">
        <span className="v2-rigrow-dot" style={{ background: statusColor }} />
      </span>
    </button>
  );
}
