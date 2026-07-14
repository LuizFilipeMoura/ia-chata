import { useEffect, useState, type ReactNode } from "react";
import "../styles/rig-terminal.css";
import { rigModifiers } from "/shared/battle-view.js";
import { rigEffects } from "/shared/game-state.js";
import { kindOf, partNamesOf, UNIT_KINDS } from "/shared/unit-kinds.js";
import { buildLoadout } from "../../lib/loadout";
import { rigStatus } from "../../lib/rigView";
import { CompRow } from "../components/CompRow";
import { HeatGauge } from "../components/HeatGauge";
import { InfoTerm } from "../components/InfoTerm";
import { ActionConsole } from "../battle/ActionConsole";
import { SPEED } from "../battle/constants";
import { LoadoutView } from "../components/LoadoutView";
import type { Rig, Component } from "../../state/types";

const CLASS_GLYPH: Record<string, string> = { light: "◆", medium: "◈", heavy: "⬢", colossal: "✦" };

interface Props {
  rig: Rig;
  canActivate: boolean;
  started: boolean;
  /** Whether this rig belongs to the viewer; enemy rigs show no activation control. */
  mine: boolean;
  /** Whether it's the viewer's activation turn (used to phrase the wait state honestly). */
  myTurn: boolean;
  onCommand: (verb: string, attrs: Record<string, unknown>) => void;
  /** Opens the Commission wizard in edit mode for this rig; rigs only (fixed loadouts on tanks/walkers). */
  onEdit?: (rigId: number) => void;
  onClose: () => void;
}

export function RigTerminal({ rig, canActivate, started, mine, myTurn, onCommand, onEdit, onClose }: Props) {
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
  const hullBonus = rigEffects(rig).hullMaxBonus;
  const lo = buildLoadout(rig);
  // Movement stats now live on the chassis — surface Speed (a Move's reach) and
  // its derived Sprint (1½× Speed, 2× with Reinforced Servos) so the status view
  // isn't silent on how far this Rig travels. Same resolution order as MoveBody:
  // chassis > class > 8.
  const speed = rig.speed ?? SPEED[rig.weightClass] ?? 8;
  const sprint = Math.round(speed * rigEffects(rig).sprintMult);
  const [view, setView] = useState<"status" | "loadout">("status");
  const loadoutText = lo?.flat ? lo.unit?.name : [lo?.lr?.name, lo?.melee?.name].filter(Boolean).join(" · ");

  // Activation control only makes sense for your own, live, undestroyed rig.
  //   activated     → static "done" chip (it already spent its turn)
  //   can activate  → the Activate CTA
  //   not my turn   → disabled "Wait for your turn"
  //   my turn, but this rig can't activate now (it's the one mid-activation, or
  //   another rig is up) → no control; "Wait for your turn" is a lie on my turn.
  let activation: ReactNode = null;
  if (mine && started && !rig.destroyed) {
    if (rig.activated) {
      activation = <span className="v2-rt-done">✓ Activated this round</span>;
    } else if (canActivate) {
      activation = (
        <button type="button" className="v2-rt-activate"
          onClick={() => onCommand("activate", { name: rig.name })}>
          ◈ Activate Rig
        </button>
      );
    } else if (!myTurn) {
      activation = (
        <button type="button" className="v2-rt-activate" disabled>
          Wait for your turn
        </button>
      );
    }
  }

  return (
    <div className="v2-rt-scrim v2-scrim v2-scrim--ember" onClick={onClose}>
      <section className="v2-rt v2-panel v2-panel--sharp" role="dialog" aria-modal="true"
        aria-label={`${rig.name} control terminal`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="v2-rt-close v2-close" aria-label="Close terminal" onClick={onClose}>✕</button>

        <header className="v2-rt-head">
          <span className="v2-rt-glyph v2-title">{CLASS_GLYPH[rig.weightClass] ?? "◆"}</span>
          <div className="v2-rt-id">
            <h2 className="v2-rt-name v2-title">{rig.name}</h2>
            <div className="v2-rt-sub"><InfoTerm id="weight-class">{badge}</InfoTerm>{loadoutText ? ` · ${loadoutText}` : ""}</div>
          </div>
          <InfoTerm as="div" id={st.gloss} className={"v2-rt-status v2-rt-status--" + (st.cls || "ok")}>{st.text}</InfoTerm>
        </header>

        {mods.length > 0 && (
          <div className="v2-rt-mods">
            <span className="v2-rt-mods-eyebrow">Active rules · tap to read</span>
            {mods.map((mod, i) => (
              <InfoTerm key={i} id={mod.gloss} className="v2-rt-mod" dataTone={mod.tone}>
                {mod.tag}
              </InfoTerm>
            ))}
          </div>
        )}

        {lo && (
          <div className="v2-rt-tabs" role="tablist" aria-label="Terminal view">
            <button type="button" role="tab" aria-selected={view === "status"}
              className={"v2-rt-tab" + (view === "status" ? " is-on" : "")}
              onClick={() => setView("status")}>Status</button>
            <button type="button" role="tab" aria-selected={view === "loadout"}
              className={"v2-rt-tab" + (view === "loadout" ? " is-on" : "")}
              onClick={() => setView("loadout")}>Loadout</button>
          </div>
        )}

        {view === "loadout" && lo ? (
          <LoadoutView loadout={lo} />
        ) : (
          <>
            <div className="v2-rt-stats">
              <span className="v2-rt-lo-stat">
                <InfoTerm as="em" id="speed" className="v2-eyebrow">Speed</InfoTerm> {speed}″
              </span>
              <span className="v2-rt-lo-stat">
                <InfoTerm as="em" id="sprint" className="v2-eyebrow">Sprint</InfoTerm> {sprint}″
              </span>
            </div>

            <div className="v2-rt-comps">
              {locs.map((loc) => {
                const comp = (rig as unknown as Record<string, Component>)[loc];
                if (!comp) return null;
                return <CompRow key={loc} rigName={rig.name} loc={loc} comp={comp} delta={loc === "hull" ? hullBonus : 0} onCommand={onCommand} />;
              })}
            </div>

            {!cold && <HeatGauge rig={rig} />}

            {started && <ActionConsole rig={rig} />}

            {activation && <div className="v2-rt-actions">{activation}</div>}
          </>
        )}

        {/* Decommission: only your own Rig, and only before the battle starts.
            Removing it frees its chassis back into the commission picker. */}
        {mine && !started && (
          <div className="v2-rt-actions">
            {kind === "rig" && onEdit && (
              <button type="button" className="v2-rt-edit"
                aria-label={`Edit loadout of ${rig.name}`}
                onClick={() => { onEdit(rig.id); onClose(); }}>
                ✎ Edit loadout
              </button>
            )}
            <button type="button" className="v2-rt-remove"
              aria-label={`Remove ${rig.name}`}
              onClick={() => { onCommand("remove", { name: rig.name }); onClose(); }}>
              ✕ Remove Rig
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
