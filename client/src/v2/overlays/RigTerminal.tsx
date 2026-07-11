import { useEffect } from "react";
import "../styles/rig-terminal.css";
import { rigModifiers } from "/shared/battle-view.js";
import { kindOf, partNamesOf, UNIT_KINDS } from "/shared/unit-kinds.js";
import { buildLoadout } from "../../lib/loadout";
import { rigStatus } from "../../lib/rigView";
import { CompRow } from "../components/CompRow";
import { HeatGauge } from "../components/HeatGauge";
import type { Rig, Component } from "../../state/types";

const CLASS_GLYPH: Record<string, string> = { light: "◆", medium: "◈", heavy: "⬢", colossal: "✦" };

interface Props {
  rig: Rig;
  canActivate: boolean;
  started: boolean;
  onCommand: (verb: string, attrs: Record<string, unknown>) => void;
  onClose: () => void;
}

export function RigTerminal({ rig, canActivate, started, onCommand, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kind = kindOf(rig);
  const locs: string[] = partNamesOf(kind);
  const cold = !UNIT_KINDS[kind].hasHeat;
  const badge = rig.weightClass || UNIT_KINDS[kind].label;
  const st = rigStatus(rig);
  const mods = rigModifiers(rig);
  const lo = buildLoadout(rig);
  const loadoutText = lo?.flat ? lo.unit?.name : [lo?.lr?.name, lo?.melee?.name].filter(Boolean).join(" · ");

  const activateLabel = canActivate ? "◈ Activate Rig" : "Wait for your turn";

  return (
    <div className="v2-rt-scrim" onClick={onClose}>
      <section className="v2-rt" role="dialog" aria-modal="true"
        aria-label={`${rig.name} control terminal`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="v2-rt-close" aria-label="Close terminal" onClick={onClose}>✕</button>

        <header className="v2-rt-head">
          <span className="v2-rt-glyph">{CLASS_GLYPH[rig.weightClass] ?? "◆"}</span>
          <div className="v2-rt-id">
            <h2 className="v2-rt-name">{rig.name}</h2>
            <div className="v2-rt-sub">{badge}{loadoutText ? ` · ${loadoutText}` : ""}</div>
          </div>
          <div className={"v2-rt-status v2-rt-status--" + (st.cls || "ok")}>{st.text}</div>
        </header>

        {mods.length > 0 && (
          <div className="v2-rt-mods">
            {mods.map((mod, i) => <span key={i} className="v2-rt-mod" data-tone={mod.tone}>{mod.tag}</span>)}
          </div>
        )}

        <div className="v2-rt-comps">
          {locs.map((loc) => (
            <CompRow key={loc} rigName={rig.name} loc={loc} comp={(rig as unknown as Record<string, Component>)[loc]} onCommand={onCommand} />
          ))}
        </div>

        {!cold && <HeatGauge rig={rig} />}

        <div className="v2-rt-actions">
          <button type="button" className="v2-rt-activate" disabled={!canActivate || !started}
            onClick={() => canActivate && onCommand("activate", { name: rig.name })}>
            {activateLabel}
          </button>
          <button type="button" className="v2-rt-remove" aria-label={`Remove ${rig.name}`}
            onClick={() => onCommand("remove", { name: rig.name })}>
            ✕ Remove Rig
          </button>
        </div>
      </section>
    </div>
  );
}
