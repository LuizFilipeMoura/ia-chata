import { useEffect, useMemo, useState } from "react";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import { useV2BattleActions } from "../state/V2BattleActionsContext";
import type { Rig } from "../../state/types";
import { BattleMap } from "./BattleMap";
import { makeProjection } from "./fieldProjection";
import { MoveTargetOverlay, MoveTargetControls, type Placed } from "./MoveTargetLayer";
import { ActionConsole } from "./ActionConsole";
import { BattleHud } from "../components/BattleHud";
import { canRigActivate } from "./activation";
import { availableActions } from "/shared/battle-view.js";
import "../styles/field.css";

export function BattleScreen({ onOpenRig }: { onOpenRig?: (id: number) => void } = {}) {
  const { rigs, game, field, ownerSide } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const { moveTarget, clearMoveTarget } = useV2BattleActions();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);

  const t = game?.turn;
  const activeRig = rigs.find((r) => r.id === t?.activeRigId) || null;
  const priorityTargetId = mySide ? (game?.priorityTargets?.[mySide] ?? null) : null;

  const activatable = (r: Rig) => canRigActivate(r, game, mySide);

  const selected = useMemo(() => {
    const r = rigs.find((x) => x.id === (activeRig?.id ?? selectedId));
    return r && !r.destroyed ? r : null;
  }, [rigs, activeRig, selectedId]);

  // The move-target session only applies to the currently active rig. Re-arming
  // (or clearing) resets any placed destination.
  const activeRigId = activeRig?.id ?? null;
  const moving =
    moveTarget && moveTarget.rigId === activeRigId ? moveTarget : null;
  useEffect(() => {
    setPlaced(null);
  }, [moveTarget]);
  // Drop a stale target if the active rig changes (or clears) server-side while
  // armed — otherwise the overlay could auto-arm when that rig re-activates later.
  useEffect(() => {
    if (moveTarget && moveTarget.rigId !== activeRigId) clearMoveTarget();
  }, [activeRigId, moveTarget, clearMoveTarget]);

  if (!field) return null;

  const proj = makeProjection(field);
  // The outer sprint ring is only offered when the engine allows sprinting now.
  const sprintAllowed =
    !!activeRig && !!t &&
    (availableActions(activeRig, t, game?.round) as { key: string; enabled: boolean }[])
      .some((a) => a.key === "sprint" && a.enabled);

  const overlay =
    moving && activeRig ? (
      <MoveTargetOverlay
        proj={proj}
        field={field}
        rigs={rigs}
        rig={activeRig}
        sprintAllowed={sprintAllowed}
        placed={placed}
        onPlaced={setPlaced}
      />
    ) : null;

  const confirmMove = () => {
    if (!moving || !activeRig || !placed) return;
    sendCommand("action", {
      name: activeRig.name,
      action: placed.action,
      dest: placed.dest,
      facing: placed.facing,
    });
    clearMoveTarget();
    setPlaced(null);
  };

  return (
    <section className="v2-battle">
      <BattleHud />
      <BattleMap
        field={field}
        objectives={game?.objectives ?? []}
        rigs={rigs}
        mySide={mySide ?? "a"}
        ownerSide={ownerSide ?? "a"}
        priorityTargetId={priorityTargetId}
        selectedId={selected?.id ?? null}
        onSelect={(r) => setSelectedId(r.id)}
        onActivate={(r) => sendCommand("activate", { name: r.name })}
        activatable={activatable}
        overlay={overlay}
      />
      <div className="v2-battle-dock">
        {selected && (
          <div className="v2-battle-vitals">
            <span className="v2-battle-name">{selected.name}</span>
            <span className="v2-battle-hull">HULL {selected.hull.sp}/{selected.hull.max}</span>
            {t && activeRig?.id === selected.id && (
              <span className="v2-battle-actions">{t.actionsMax - t.actionsUsed} actions left</span>
            )}
            {onOpenRig && (
              <button
                type="button"
                className="v2-battle-details"
                onClick={() => onOpenRig(selected.id)}
              >
                Details
              </button>
            )}
          </div>
        )}
        {moving && activeRig ? (
          <MoveTargetControls
            rig={activeRig}
            action={placed?.action ?? "move"}
            placed={placed}
            onConfirm={confirmMove}
            onCancel={() => clearMoveTarget()}
          />
        ) : (
          activeRig && (activeRig.owner || "a") === mySide && <ActionConsole rig={activeRig} />
        )}
      </div>
    </section>
  );
}
