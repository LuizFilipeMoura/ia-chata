import { useEffect, useRef, useState } from "react";
import { WEAPONS, EQUIPMENT, canAddRigForSide, WEAPON_UPGRADES } from "/shared/game-state.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";

const STEPS = ["Identity", "Weapons", "Equipment", "Confirm"];

function firstUpgradeId(name: string): string | null {
  return (WEAPON_UPGRADES[name] || [])[0]?.id || null;
}

interface WizardState {
  step: number;
  name: string;
  cls: string;
  owner: string;
  longRange: string;
  melee: string;
  longRangeUpgrade: string | null;
  meleeUpgrade: string | null;
  equipment: string;
}

export function RigWizard({ onClose }: { onClose: () => void }) {
  const { rigs, game, session } = useRoomState();
  const sendCommand = useCommands();
  const mySide = session?.side || "a";
  const enemySide = mySide === "a" ? "b" : "a";

  const [state, setState] = useState<WizardState>(() => {
    const longRange = Object.keys(WEAPONS.longRange)[0];
    const melee = Object.keys(WEAPONS.melee)[0];
    return {
      step: 0,
      name: "",
      cls: "medium",
      owner: mySide,
      longRange,
      melee,
      longRangeUpgrade: firstUpgradeId(longRange),
      meleeUpgrade: firstUpgradeId(melee),
      equipment: Object.keys(EQUIPMENT)[0],
    };
  });

  // Scrim enter/leave: mount without `show`, add it next frame; on close remove
  // `show` and unmount after the 250ms transition. Mirrors rig-wizard.js.
  const [show, setShow] = useState(false);
  const closing = useRef(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setShow(false);
    setTimeout(onClose, 250);
  };

  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));

  const submit = () => {
    sendCommand("add", {
      name: state.name.trim(),
      class: state.cls,
      owner: state.owner,
      lr: state.longRange,
      melee: state.melee,
      longRangeUpgrade: state.longRangeUpgrade,
      meleeUpgrade: state.meleeUpgrade,
      equipment: state.equipment,
    });
    close();
  };

  const upgradeChoices = (
    name: string,
    selected: string | null,
    onSelect: (id: string) => void,
  ) => (
    <div className="rw-upgrade-choices">
      {(WEAPON_UPGRADES[name] || []).map((u) => (
        <button
          key={u.id}
          type="button"
          className={"rw-upgrade-choice" + (u.id === selected ? " sel" : "")}
          title={u.tag}
          onClick={() => onSelect(u.id)}
        >
          <span>{u.name}</span>
          <small>{u.tag}</small>
        </button>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (state.step === 0) {
    body = (
      <div className="rw-body">
        <div className="rw-field">
          <label>Name</label>
          <input
            type="text"
            className="rw-name"
            placeholder="Rig name"
            value={state.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>
        <div className="rw-field">
          <label>Weight class</label>
          <select value={state.cls} onChange={(e) => patch({ cls: e.target.value })}>
            {["light", "medium"].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="rw-field">
          <label>Side</label>
          <select value={state.owner} onChange={(e) => patch({ owner: e.target.value })}>
            <option value={mySide}>You</option>
            <option value={enemySide}>Enemy</option>
          </select>
        </div>
      </div>
    );
  } else if (state.step === 1) {
    body = (
      <div className="rw-body">
        <div className="rw-field">
          <label>Long range weapon</label>
          <select
            value={state.longRange}
            onChange={(e) => {
              const v = e.target.value;
              patch({ longRange: v, longRangeUpgrade: firstUpgradeId(v) });
            }}
          >
            {Object.keys(WEAPONS.longRange).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        {upgradeChoices(state.longRange, state.longRangeUpgrade, (id) =>
          patch({ longRangeUpgrade: id }),
        )}
        <div className="rw-field">
          <label>Melee weapon</label>
          <select
            value={state.melee}
            onChange={(e) => {
              const v = e.target.value;
              patch({ melee: v, meleeUpgrade: firstUpgradeId(v) });
            }}
          >
            {Object.keys(WEAPONS.melee).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        {upgradeChoices(state.melee, state.meleeUpgrade, (id) =>
          patch({ meleeUpgrade: id }),
        )}
        <div className="rw-hint">
          Choose one upgrade for each weapon. The selected upgrade changes how that weapon works.
        </div>
      </div>
    );
  } else if (state.step === 2) {
    body = (
      <div className="rw-body">
        <div className="rw-equip-grid">
          {Object.entries(EQUIPMENT).map(([id, e]) => (
            <button
              key={id}
              type="button"
              className={"rw-equip-card" + (id === state.equipment ? " sel" : "")}
              onClick={() => patch({ equipment: id })}
            >
              <div className="rw-equip-family">{e.family}</div>
              <div className="rw-equip-label">{e.label}</div>
              <div className="rw-equip-passive">{e.passive}</div>
              <div className="rw-equip-active">
                <b>{e.active.label}</b> ({e.active.heat >= 0 ? "+" : ""}{e.active.heat} heat) — {e.active.text}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  } else {
    const e = EQUIPMENT[state.equipment];
    const lrUpgrade = (WEAPON_UPGRADES[state.longRange] || []).find(
      (u) => u.id === state.longRangeUpgrade,
    );
    const meleeUpgrade = (WEAPON_UPGRADES[state.melee] || []).find(
      (u) => u.id === state.meleeUpgrade,
    );
    body = (
      <div className="rw-body rw-confirm">
        <div className="rw-confirm-name">{(state.name || "(unnamed)")} — {state.cls}</div>
        <div className="rw-confirm-row">{state.longRange} - {lrUpgrade?.name || "Upgrade ?"}</div>
        <div className="rw-confirm-row">{state.melee} - {meleeUpgrade?.name || "Upgrade ?"}</div>
        <div className="rw-confirm-row">{e.label} - {e.passive}</div>
      </div>
    );
  }

  const canAdd = canAddRigForSide({ rigs, game }, state.owner);
  const atName = state.step === 0 && !state.name.trim();

  return (
    <div
      className={"rw-scrim" + (show ? " show" : "")}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="rw-card">
        <div className="rw-head">
          <div className="rw-title">◈ Commission a Rig</div>
          <div className="rw-dots">
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={"rw-dot" + (i === state.step ? " on" : i < state.step ? " done" : "")}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {body}

        <div className="rw-nav">
          {state.step > 0 && (
            <button
              type="button"
              className="rw-btn ghost"
              onClick={() => patch({ step: state.step - 1 })}
            >
              Back
            </button>
          )}
          {state.step < STEPS.length - 1 ? (
            <button
              type="button"
              className="rw-btn"
              disabled={atName}
              onClick={() => patch({ step: state.step + 1 })}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="rw-btn"
              disabled={!canAdd}
              onClick={submit}
            >
              {canAdd ? "Commission" : "Roster full"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
