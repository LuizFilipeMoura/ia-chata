import React from "react";
import { heatMeter } from "/shared/game-state.js";
import { rigModifiers } from "/shared/battle-view.js";
import { rigStatus } from "../../lib/rigView";
import { buildLoadout } from "../../lib/loadout";
import { CompRow } from "./CompRow";
import { HeatGauge } from "./HeatGauge";
import { ActionConsole } from "../battle/ActionConsole";
import { GlossaryText } from "../chat/GlossaryText";
import type { Rig, Loc } from "../../state/types";

const LOCS: Loc[] = ["hull", "arms", "legs", "engine"];

interface Props {
  rig: Rig;
  isActive: boolean;
  isOpen: boolean;
  started: boolean;
  canActivateNow: boolean;
  /** The viewer's side; used to tell own Rigs from enemy Rigs. */
  mySide?: string;
  onCommand: (verb: string, attrs: Record<string, unknown>) => void;
  onToggle: (id: number) => void;
  onActivateLocal: (id: number | null) => void;
}

// Build one accordion entry: a header that is always visible (name, class,
// heat chip, active toggle) and a collapsible body with the full terminal.
export const RigItem = React.memo(function RigItem({
  rig, isActive, isOpen, started, canActivateNow, mySide = "a",
  onCommand, onToggle, onActivateLocal,
}: Props) {
  const m = heatMeter(rig);
  const st = rigStatus(rig);
  const isMine = (rig.owner || "a") === mySide;

  const itemCls = ["rig-item"];
  if (rig.destroyed) itemCls.push("is-destroyed");
  if (isActive) itemCls.push("is-active");
  if (isOpen) itemCls.push("is-open");

  const toggle = () => onToggle(rig.id);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  };

  // During battle, activation is server-authoritative: only the side whose turn
  // it is may activate one of its own un-activated Rigs, one at a time.
  const onActivateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (started) {
      if (canActivateNow) onCommand("activate", { name: rig.name });
    } else if (isMine) {
      onActivateLocal(isActive ? null : rig.id);
    }
  };

  // Enemy Rigs, in battle, expose no activation control — you can't drive them.
  // Show a read-only status token instead ("● Active" / "Done" / "Inactive").
  let activate: React.ReactNode;
  if (started && !isMine) {
    activate = (
      <span
        className={"rig-activate rig-activate--readonly" + (isActive ? " on" : "")}
        title={isActive ? "This enemy Rig is taking its activation"
          : rig.activated ? "This enemy Rig has already acted this round" : "This enemy Rig is idle"}
      >
        {isActive ? "● Active" : (rig.activated ? "Done" : "Inactive")}
      </span>
    );
  } else {
    activate = (
      <button
        type="button"
        className={"rig-activate" + (isActive ? " on" : "")}
        aria-pressed={isActive}
        title={isActive ? "This Rig is taking its activation"
          : started ? (canActivateNow ? "Activate this Rig" : "Wait for your turn to activate")
          : isMine ? "Preview this Rig's heat gauge" : "You can only preview your own Rig's heat gauge"}
        disabled={started ? !canActivateNow : !isMine}
        onClick={onActivateClick}
      >
        {isActive ? "● Active" : (started && rig.activated ? "Done" : "Activate")}
      </button>
    );
  }

  const mods = rigModifiers(rig);

  return (
    <div className={itemCls.join(" ")}>
      {/* ---- Header (click to expand) ---- */}
      <div
        className="rig-head"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <span className={"rig-dot " + (st.cls || "ok")} />
        <span className="rig-head-name">{rig.name}</span>
        <span className="rig-badge">{rig.weightClass}</span>
        <span
          className="rig-heat-chip"
          data-zone={m.zone}
          title={m.over > 0 ? `Overheating: misfire roll D12 + ${m.bonus}` : `Heat ${m.heat} of ${m.cap}`}
        >
          <span className="rig-heat-chip-ic">🔥</span>{m.heat}
        </span>
        {activate}
        <span className="rig-chev">▾</span>
      </div>

      {/* ---- Body (collapsible) ---- */}
      <div className="rig-body">
        <div className="rig-body-inner">
          <div className={"rig-status " + st.cls}>{st.text}</div>

          {mods.length > 0 && (
            <div className="rig-mods">
              {mods.map((mod, i) => (
                <span key={i} className="rig-mod" data-tone={mod.tone}>{mod.tag}</span>
              ))}
            </div>
          )}

          {(() => {
            const lo = buildLoadout(rig);
            if (!lo) return null;
            return (
              <div className="rig-loadout">
                <div className="rig-loadout-hd">Loadout</div>
                <div className="rig-loadout-row">
                  <span className="rig-loadout-ic">🎯</span>
                  <div className="rig-loadout-main">
                    <div className="rig-loadout-slot">Long Range</div>
                    <div className="rig-loadout-name">{lo.lr.name}</div>
                    <div className="rig-loadout-up">
                      Upgrade · {lo.lr.upName} — <GlossaryText text={lo.lr.upTag} />
                    </div>
                  </div>
                </div>
                <div className="rig-loadout-row">
                  <span className="rig-loadout-ic">🗡️</span>
                  <div className="rig-loadout-main">
                    <div className="rig-loadout-slot">Melee</div>
                    <div className="rig-loadout-name">{lo.melee.name}</div>
                    <div className="rig-loadout-up">
                      Upgrade · {lo.melee.upName} — <GlossaryText text={lo.melee.upTag} />
                    </div>
                  </div>
                </div>
                {lo.equipment && (
                  <div className="rig-loadout-row rig-loadout-row--eq">
                    <span className="rig-loadout-ic">🛠</span>
                    <div className="rig-loadout-main">
                      <div className="rig-loadout-slot">Equipment · {lo.equipment.family}</div>
                      <div className="rig-loadout-name">{lo.equipment.label}</div>
                      <div className="rig-loadout-passive">
                        Passive · <GlossaryText text={lo.equipment.passive} />
                      </div>
                      <div className="rig-loadout-active">
                        Active · {lo.equipment.activeLabel} ({lo.equipment.activeHeat >= 0 ? "+" : ""}
                        {lo.equipment.activeHeat} heat) — <GlossaryText text={lo.equipment.activeText} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {LOCS.map((loc) => (
            <CompRow key={loc} rig={rig} loc={loc} onCommand={onCommand} />
          ))}

          <HeatGauge rig={rig} isActive={isActive} started={started} onCommand={onCommand} />

          {started && <ActionConsole rig={rig} />}

          <button
            className="rig-remove-row"
            type="button"
            aria-label={`Remove ${rig.name}`}
            onClick={() => onCommand("remove", { name: rig.name })}
          >
            ✕ Remove Rig
          </button>
        </div>
      </div>
    </div>
  );
});
