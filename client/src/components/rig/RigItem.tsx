import React from "react";
import { heatMeter } from "/shared/game-state.js";
import { rigModifiers } from "/shared/battle-view.js";
import { partNamesOf, kindOf, UNIT_KINDS } from "/shared/unit-kinds.js";
import { rigStatus } from "../../lib/rigView";
import { buildLoadout } from "../../lib/loadout";
import { useChassisDescriptions } from "../../hooks/useChassisDescriptions";
import { CompRow } from "./CompRow";
import { HeatGauge } from "./HeatGauge";
import { ActionConsole } from "../battle/ActionConsole";
import { GlossaryText } from "../chat/GlossaryText";
import type { Rig } from "../../state/types";

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
  const kind = kindOf(rig);
  const LOCS: string[] = partNamesOf(kind);
  // Cold kinds (Tank / Walker) don't track heat — hide heat UI, and label the
  // header by kind since they carry no weight class.
  const cold = !UNIT_KINDS[kind].hasHeat;
  const badge = rig.weightClass || UNIT_KINDS[kind].label;

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

  // The header carries only a read-only status token so tapping the row to
  // expand can never fire an activation. The interactive Activate control lives
  // in the body (below), out of the expand target's way.
  const statusText = isActive
    ? "● Active"
    : started
      ? (rig.activated ? "Done" : "Idle")
      : "Idle";
  const headerStatus = (
    <span
      className={"rig-activate rig-activate--readonly" + (isActive ? " on" : "")}
      title={isActive ? "This Rig is taking its activation"
        : started ? (rig.activated ? "Already acted this round" : "Not yet activated")
        : "Not in battle yet"}
    >
      {statusText}
    </span>
  );

  // Own Rigs get an interactive Activate button in the body. Before the battle
  // starts it toggles a local heat-gauge preview; during battle it activates.
  // Only render the body control when it's actionable/informative: an idle own
  // Rig during battle (activate CTA or a "wait" hint), or the pre-battle preview
  // toggle. Once active or done, the header status chip already says so — no
  // need for a redundant full-width bar.
  let activateControl: React.ReactNode = null;
  if (isMine && !(started && (isActive || rig.activated))) {
    const label = started
      ? (canActivateNow ? "Activate Rig" : "Wait for your turn")
      : (isActive ? "● Previewing" : "Preview heat gauge");
    activateControl = (
      <button
        type="button"
        className={"rig-activate rig-activate--body" + (isActive ? " on" : "")}
        aria-pressed={isActive}
        disabled={started ? !canActivateNow : false}
        onClick={onActivateClick}
      >
        {label}
      </button>
    );
  }

  const mods = rigModifiers(rig);
  const chassisDescriptions = useChassisDescriptions();
  const description = rig.chassis ? chassisDescriptions[rig.chassis] : undefined;

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
        <span className="rig-badge">{badge}</span>
        {!cold && (
          <span
            className="rig-heat-chip"
            data-zone={m.zone}
            title={m.over > 0 ? `Overheating: misfire roll D12 + ${m.bonus}` : `Heat ${m.heat} of ${m.cap}`}
          >
            <span className="rig-heat-chip-ic">🔥</span>{m.heat}
          </span>
        )}
        {headerStatus}
        <span className="rig-chev">▾</span>
      </div>

      {/* ---- Body (collapsible) ---- */}
      <div className="rig-body">
        <div className="rig-body-inner">
          {description && <div className="rig-desc">{description}</div>}
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
                {lo.flat ? (
                  <div className="rig-loadout-row">
                    <span className="rig-loadout-ic">🎯</span>
                    <div className="rig-loadout-main">
                      <div className="rig-loadout-slot">Weapon</div>
                      <div className="rig-loadout-name">{lo.unit?.name}</div>
                      <div className="rig-loadout-up">Flat Penetration · no weight-class scaling</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rig-loadout-row">
                      <span className="rig-loadout-ic">🎯</span>
                      <div className="rig-loadout-main">
                        <div className="rig-loadout-slot">Long Range</div>
                        <div className="rig-loadout-name">{lo.lr?.name}</div>
                        <div className="rig-loadout-up">
                          Upgrade · {lo.lr?.upName} — <GlossaryText text={lo.lr?.upTag ?? ""} />
                        </div>
                      </div>
                    </div>
                    <div className="rig-loadout-row">
                      <span className="rig-loadout-ic">🗡️</span>
                      <div className="rig-loadout-main">
                        <div className="rig-loadout-slot">Melee</div>
                        <div className="rig-loadout-name">{lo.melee?.name}</div>
                        <div className="rig-loadout-up">
                          Upgrade · {lo.melee?.upName} — <GlossaryText text={lo.melee?.upTag ?? ""} />
                        </div>
                      </div>
                    </div>
                  </>
                )}
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

          {activateControl && (
            <div className="rig-activate-row">{activateControl}</div>
          )}

          <HeatGauge rig={rig} isActive={isActive} />

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
