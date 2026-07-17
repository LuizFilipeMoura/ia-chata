import { useMemo, useState } from "react";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import type { Rig } from "../../state/types";
import { BattleMap } from "./BattleMap";
import { ActionConsole } from "./ActionConsole";
import { BattleHud } from "../components/BattleHud";
import { canRigActivate } from "./activation";
import "../styles/field.css";

export function BattleScreen() {
  const { rigs, game, field, ownerSide } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const t = game?.turn;
  const activeRig = rigs.find((r) => r.id === t?.activeRigId) || null;
  const priorityTargetId = mySide ? (game?.priorityTargets?.[mySide] ?? null) : null;

  const activatable = (r: Rig) => canRigActivate(r, game, mySide);

  const selected = useMemo(() => {
    const r = rigs.find((x) => x.id === (activeRig?.id ?? selectedId));
    return r && !r.destroyed ? r : null;
  }, [rigs, activeRig, selectedId]);

  if (!field) return null;

  return (
    <section className="v2-battle">
      <BattleHud />
      <BattleMap
        field={field}
        rigs={rigs}
        mySide={mySide ?? "a"}
        ownerSide={ownerSide ?? "a"}
        priorityTargetId={priorityTargetId}
        selectedId={selected?.id ?? null}
        onSelect={(r) => setSelectedId(r.id)}
        onActivate={(r) => sendCommand("activate", { name: r.name })}
        activatable={activatable}
      />
      <div className="v2-battle-dock">
        {selected && (
          <div className="v2-battle-vitals">
            <span className="v2-battle-name">{selected.name}</span>
            <span className="v2-battle-hull">HULL {selected.hull.sp}/{selected.hull.max}</span>
            {t && activeRig?.id === selected.id && (
              <span className="v2-battle-actions">{t.actionsMax - t.actionsUsed} actions left</span>
            )}
          </div>
        )}
        {activeRig && <ActionConsole rig={activeRig} />}
      </div>
    </section>
  );
}
