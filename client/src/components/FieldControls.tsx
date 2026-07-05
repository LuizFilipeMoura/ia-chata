import { useState } from "react";
import { FIELD_MIN, FIELD_MAX } from "/shared/field.js";
import { useRoomState } from "../state/RoomStateContext";
import { useCommands } from "../hooks/useCommands";
import { useDrawer } from "../state/DrawerContext";
import { FieldMap } from "./FieldMap";
import type { FieldState, Objective } from "../state/types";

const DEFAULT_FIELD: FieldState = {
  width: 54, height: 36, diagonal: "tlbr", terrain: [], locked: false,
};

// The drawer body: local dims, live server-driven preview, dispatches commands.
function FieldSetupBody({ onLocked }: { onLocked: () => void }) {
  const { game, field, ownerSide, session } = useRoomState();
  const sendCommand = useCommands();
  const f = field ?? DEFAULT_FIELD;
  const [w, setW] = useState(f.width);
  const [h, setH] = useState(f.height);

  const apply = () => sendCommand("field", { action: "set", width: w, height: h });
  const flip = () =>
    sendCommand("field", {
      action: "set", width: w, height: h,
      diagonal: f.diagonal === "tlbr" ? "trbl" : "tlbr",
    });
  const reroll = () => sendCommand("field", { action: "reroll" });
  const lock = async () => { await sendCommand("field", { action: "lock" }); onLocked(); };

  return (
    <div className="field-controls">
      <FieldMap
        field={f}
        objectives={(game?.objectives as Objective[]) ?? []}
        mySide={session?.side ?? "a"}
        ownerSide={ownerSide ?? null}
      />
      <div className="fc-row">
        <label>Width (in)
          <input type="number" min={FIELD_MIN.width} max={FIELD_MAX.width}
            value={w} onChange={(e) => setW(Number(e.target.value))} />
        </label>
        <label>Height (in)
          <input type="number" min={FIELD_MIN.height} max={FIELD_MAX.height}
            value={h} onChange={(e) => setH(Number(e.target.value))} />
        </label>
      </div>
      <div className="fc-row">
        <button type="button" className="dwr-btn" onClick={apply}>Apply size</button>
        <button type="button" className="dwr-btn" onClick={flip}>Flip diagonal</button>
        <button type="button" className="dwr-btn" onClick={reroll}>Re-roll terrain</button>
        <button type="button" className="dwr-btn primary" onClick={lock}>Lock field</button>
      </div>
    </div>
  );
}

export function FieldControls() {
  const { game, field, ownerSide, session } = useRoomState();
  const { openDrawer, closeDrawer } = useDrawer();
  const f = field ?? DEFAULT_FIELD;
  const isOwner = Boolean(session?.side && session.side === ownerSide);
  const started = Boolean(game?.started);

  return (
    <section className="field-controls" aria-label="Battlefield">
      <FieldMap
        field={f}
        objectives={(game?.objectives as Objective[]) ?? []}
        mySide={session?.side ?? "a"}
        ownerSide={ownerSide ?? null}
      />
      {isOwner && !started && !f.locked ? (
        <button
          type="button"
          className="btn btn--primary"
          onClick={() =>
            openDrawer({
              title: "Field setup",
              tone: "oil",
              render: () => <FieldSetupBody onLocked={closeDrawer} />,
            })
          }
        >
          Set field
        </button>
      ) : null}
      {!isOwner && !f.locked ? (
        <p className="fc-wait">Waiting for the owner to set the field…</p>
      ) : null}
    </section>
  );
}
