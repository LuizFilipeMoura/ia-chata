import { useState } from "react";
import { FIELD_MIN, FIELD_MAX } from "/shared/field.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import { useV2Drawer } from "../state/V2DrawerContext";
import { FieldMap } from "./FieldMap";
import type { FieldState, Objective } from "../../state/types";
import "../styles/field.css";

const DEFAULT_FIELD: FieldState = {
  width: 54, height: 36, diagonal: "tlbr", terrain: [], locked: false,
};

// The drawer body: local dims, live server-driven preview, dispatches commands.
function FieldSetupBody({ onLocked }: { onLocked: () => void }) {
  const { game, field, ownerSide } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
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
    <div className="v2-fs">
      <FieldMap
        field={f}
        objectives={(game?.objectives as Objective[]) ?? []}
        mySide={mySide}
        ownerSide={ownerSide ?? null}
      />

      <div className="v2-fs-legend">
        <span className="v2-fs-leg v2-fs-leg--mine">You deploy</span>
        <span className="v2-fs-leg v2-fs-leg--foe">Enemy deploys</span>
        <span className="v2-fs-leg v2-fs-leg--obj">Objective</span>
      </div>

      <div className="v2-fs-group">
        <span className="v2-fs-label">Field dimensions</span>
        <div className="v2-fs-dims">
          <div className="v2-fs-num">
            <span className="v2-fs-cap">Width</span>
            <input type="number" min={FIELD_MIN.width} max={FIELD_MAX.width}
              value={w} onChange={(e) => setW(Number(e.target.value))} />
            <span className="v2-fs-unit">in</span>
          </div>
          <div className="v2-fs-num">
            <span className="v2-fs-cap">Height</span>
            <input type="number" min={FIELD_MIN.height} max={FIELD_MAX.height}
              value={h} onChange={(e) => setH(Number(e.target.value))} />
            <span className="v2-fs-unit">in</span>
          </div>
          <button type="button" className="v2-fs-apply" onClick={apply}>Apply</button>
        </div>
      </div>

      <div className="v2-fs-group">
        <span className="v2-fs-label">Terrain &amp; orientation</span>
        <div className="v2-fs-actions">
          <button type="button" className="v2-dwr-btn ghost" onClick={flip}>Flip diagonal</button>
          <button type="button" className="v2-dwr-btn ghost" onClick={reroll}>Re-roll terrain</button>
        </div>
      </div>

      <button type="button" className="v2-fs-lock" onClick={lock}>Lock field</button>
    </div>
  );
}

export function FieldControls() {
  const { game, field, ownerSide, session } = useRoomState();
  const { openDrawer, closeDrawer } = useV2Drawer();
  const mySide = useMySide();
  const f = field ?? DEFAULT_FIELD;
  const isOwner = Boolean(session?.side && session.side === ownerSide);
  const started = Boolean(game?.started);

  return (
    <section className="v2-fc" aria-label="Battlefield">
      <FieldMap
        field={f}
        objectives={(game?.objectives as Objective[]) ?? []}
        mySide={mySide}
        ownerSide={ownerSide ?? null}
      />
      {isOwner && !started && !f.locked ? (
        <button
          type="button"
          className="v2-fc-set"
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
        <p className="v2-fc-wait">Waiting for the owner to set the field…</p>
      ) : null}
    </section>
  );
}
