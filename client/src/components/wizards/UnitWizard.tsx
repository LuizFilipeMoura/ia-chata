import { useEffect, useRef, useState } from "react";
import {
  WEAPONS, EQUIPMENT, canAddRigForSide, WEAPON_UPGRADES, RIG_DEFAULTS, HEAT_CAPACITY,
  UNIT_WEAPONS, PREBUILT_RIGS, upgradeNature,
} from "/shared/game-state.js";
import { UNIT_KINDS } from "/shared/unit-kinds.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import { useUi } from "../../state/UiStateContext";
import { GlossaryText } from "../chat/GlossaryText";

function stepsFor(kind: "rig" | "tank" | "walker"): string[] {
  if (kind === "rig") return ["Kind", "Identity", "Weapons", "Equipment", "Confirm"];
  return ["Kind", "Identity", "Weapon", "Confirm"];
}

function firstUpgradeId(name: string): string | null {
  return (WEAPON_UPGRADES[name] || [])[0]?.id || null;
}

// Authored content layered onto a prebuilt by the server (content/prebuilts.json).
interface PrebuiltContent {
  description?: string; focus?: string; balance?: string; personality?: string;
}

interface WizardState {
  step: number;
  kind: "rig" | "tank" | "walker";
  name: string;
  cls: string;
  owner: string;
  prebuilt: string; // chosen PREBUILT_RIGS id; drives cls + longRange + melee
  longRange: string;
  melee: string;
  longRangeUpgrade: string | null;
  meleeUpgrade: string | null;
  equipment: string;
  unit: string; // flat-pick weapon for Tank / Walker
}

export function UnitWizard({ onClose }: { onClose: () => void }) {
  const { rigs, game } = useRoomState();
  const sendCommand = useCommands();
  const { setGlossaryOpen } = useUi();
  const mySide = useMySide();
  const enemySide = mySide === "a" ? "b" : "a";

  const [state, setState] = useState<WizardState>(() => {
    const pb = PREBUILT_RIGS[0];
    return {
      step: 0,
      kind: "rig",
      name: "",
      cls: pb.class,
      owner: mySide,
      prebuilt: pb.id,
      longRange: pb.longRange,
      melee: pb.melee,
      longRangeUpgrade: firstUpgradeId(pb.longRange),
      meleeUpgrade: firstUpgradeId(pb.melee),
      equipment: Object.keys(EQUIPMENT)[0],
      unit: Object.keys(UNIT_WEAPONS)[0],
    };
  });

  // Selecting a prebuilt locks weight class + both weapons and resets each
  // weapon to its first upgrade; the player re-picks upgrades below the grid.
  // Invariant: the first upgrade per weapon is always Field nature (Task 2), so
  // this reset can never leave the rig with two Prototype upgrades selected.
  const selectPrebuilt = (id: string) => {
    const pb = PREBUILT_RIGS.find((p) => p.id === id);
    if (!pb) return;
    patch({
      prebuilt: pb.id,
      cls: pb.class,
      longRange: pb.longRange,
      melee: pb.melee,
      longRangeUpgrade: firstUpgradeId(pb.longRange),
      meleeUpgrade: firstUpgradeId(pb.melee),
    });
  };

  const STEPS = stepsFor(state.kind);

  // Authored description / focus / balance / personality per prebuilt id, loaded
  // from the server's editable catalogue. Falls back to empty (grid still works
  // off the built-in weapons/class) if the fetch fails.
  const [content, setContent] = useState<Record<string, PrebuiltContent>>({});
  useEffect(() => {
    let live = true;
    fetch("/api/prebuilts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!live || !data?.prebuilts) return;
        const map: Record<string, PrebuiltContent> = {};
        for (const p of data.prebuilts) {
          map[p.id] = { description: p.description, focus: p.focus, balance: p.balance, personality: p.personality };
        }
        setContent(map);
      })
      .catch(() => { /* keep built-in defaults */ });
    return () => { live = false; };
  }, []);

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
    if (state.kind === "rig") {
      sendCommand("add", {
        name: state.name.trim(),
        kind: "rig",
        prebuilt: state.prebuilt,
        class: state.cls,
        owner: state.owner,
        lr: state.longRange,
        melee: state.melee,
        longRangeUpgrade: state.longRangeUpgrade,
        meleeUpgrade: state.meleeUpgrade,
        equipment: state.equipment,
      });
    } else {
      sendCommand("add", {
        name: state.name.trim(),
        kind: state.kind,
        owner: state.owner,
        unit: state.unit,
      });
    }
    close();
  };

  const upgradeChoices = (
    name: string,
    selected: string | null,
    onSelect: (id: string) => void,
    otherIsPrototype: boolean,
  ) => (
    <div className="rw-upgrade-choices">
      {(WEAPON_UPGRADES[name] || []).map((u) => {
        const locked = u.nature === "prototype" && otherIsPrototype && u.id !== selected;
        return (
          <button
            key={u.id}
            type="button"
            disabled={locked}
            className={"rw-upgrade-choice" + (u.id === selected ? " sel" : "") + (locked ? " locked" : "")}
            title={locked ? "A rig may run at most one Prototype upgrade" : u.tag}
            onClick={() => !locked && onSelect(u.id)}
          >
            <span>{u.name} <em className={"rw-nature rw-nature-" + u.nature}>{u.nature[0].toUpperCase() + u.nature.slice(1)}</em></span>
            <small>Upgrade · <GlossaryText text={u.tag} /></small>
          </button>
        );
      })}
    </div>
  );

  let body: React.ReactNode;
  if (state.step === 0) {
    body = (
      <div className="rw-body">
        <div className="rw-equip-grid">
          {(["rig", "tank", "walker"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={"rw-equip-card" + (k === state.kind ? " sel" : "")}
              onClick={() => patch({ kind: k, step: 0 })}
            >
              <div className="rw-equip-family">Chassis</div>
              <div className="rw-equip-label">{UNIT_KINDS[k].label}</div>
              <div className="rw-equip-passive">
                {k === "rig"
                  ? "Heat + weight class + two weapon slots + equipment. 3 actions."
                  : k === "tank"
                  ? "Cold single-model machine. One flat-pick weapon. 2 actions."
                  : "Cold walker chassis. One flat-pick weapon. 3 actions, mobile."}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  } else if (state.step === 1) {
    body = (
      <div className="rw-body">
        <div className="rw-field">
          <label>Name</label>
          <input
            type="text"
            className="rw-name"
            placeholder={`${UNIT_KINDS[state.kind].label} name`}
            value={state.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
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
  } else if (state.step === 2) {
    if (state.kind === "rig") {
      const lr = WEAPONS.longRange[state.longRange];
      const ml = WEAPONS.melee[state.melee];
      body = (
        <div className="rw-body">
          <div className="rw-field">
            <label>Prebuilt chassis</label>
            <div className="rw-equip-grid">
              {PREBUILT_RIGS.map((pb) => (
                <button
                  key={pb.id}
                  type="button"
                  className={"rw-equip-card" + (pb.id === state.prebuilt ? " sel" : "")}
                  onClick={() => selectPrebuilt(pb.id)}
                >
                  <div className="rw-equip-family">{pb.class}{content[pb.id]?.focus ? ` · ${content[pb.id]!.focus}` : ""}</div>
                  <div className="rw-equip-label">{pb.label}</div>
                  <div className="rw-equip-passive">
                    Hull {RIG_DEFAULTS[pb.class].hull} · Arms/Legs {RIG_DEFAULTS[pb.class].arms} · Engine {RIG_DEFAULTS[pb.class].engine} (heat cap {HEAT_CAPACITY[pb.class]})
                  </div>
                  {content[pb.id]?.description ? (
                    <div className="rw-equip-active">{content[pb.id]!.description}</div>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
          <div className="rw-field">
            <label>🎯 {state.longRange} <small>· ROF {lr.rof} · STR {lr.str} · {lr.minRange}–{lr.maxRange}"</small></label>
          </div>
          {upgradeChoices(state.longRange, state.longRangeUpgrade, (id) =>
            patch({ longRangeUpgrade: id }),
            upgradeNature(state.melee, state.meleeUpgrade) === "prototype",
          )}
          <div className="rw-field">
            <label>🗡️ {state.melee} <small>· ROF {ml.rof} · STR {ml.str} · RNG {ml.rng?.[0]}/{ml.rng?.[1]}"</small></label>
          </div>
          {upgradeChoices(state.melee, state.meleeUpgrade, (id) =>
            patch({ meleeUpgrade: id }),
            upgradeNature(state.longRange, state.longRangeUpgrade) === "prototype",
          )}
          <div className="rw-hint">
            Weapons and weight class are fixed by the prebuilt. Choose one upgrade for each weapon.
          </div>
        </div>
      );
    } else {
      body = (
        <div className="rw-body">
          <div className="rw-field">
            <label>Unit weapon</label>
            <div className="rw-equip-grid">
              {Object.entries(UNIT_WEAPONS).map(([name, w]: [string, any]) => (
                <button
                  key={name}
                  type="button"
                  className={"rw-equip-card" + (name === state.unit ? " sel" : "")}
                  onClick={() => patch({ unit: name })}
                >
                  <div className="rw-equip-family">
                    {w.melee ? "Melee" : "Ranged"}
                  </div>
                  <div className="rw-equip-label">{name}</div>
                  <div className="rw-equip-passive">
                    ROF {w.rof} · STR {w.str} · {w.melee ? `RNG ${w.rng[0]}/${w.rng[1]}"` : `Sweet ${w.sweet}" · ${w.minRange}–${w.maxRange}"`}
                  </div>
                  <div className="rw-equip-active">
                    {w.perks?.length ? w.perks.join(", ") : "—"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }
  } else if (state.step === 3) {
    if (state.kind === "rig") {
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
                <div className="rw-equip-passive">Passive · <GlossaryText text={e.passive} /></div>
                <div className="rw-equip-active">
                  Active · <b>{e.active.label}</b> ({e.active.heat >= 0 ? "+" : ""}{e.active.heat} heat) — <GlossaryText text={e.active.text} />
                </div>
              </button>
            ))}
          </div>
        </div>
      );
    } else {
      const w = UNIT_WEAPONS[state.unit];
      body = (
        <div className="rw-body rw-confirm">
          <div className="rw-confirm-name">{(state.name || "(unnamed)")} — {UNIT_KINDS[state.kind].label}</div>
          <div className="rw-confirm-row">🎯 {state.unit} · STR {w.str} · ROF {w.rof}</div>
        </div>
      );
    }
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
        <div className="rw-confirm-row">🎯 {state.longRange} · {lrUpgrade?.name || "Upgrade ?"}</div>
        <div className="rw-confirm-row">🗡️ {state.melee} · {meleeUpgrade?.name || "Upgrade ?"}</div>
        <div className="rw-confirm-row">🛠 {e.label} · {e.passive}</div>
        {content[state.prebuilt]?.personality ? (
          <div className="rw-confirm-row rw-confirm-flavor">“{content[state.prebuilt]!.personality}”</div>
        ) : null}
      </div>
    );
  }

  const canAdd = canAddRigForSide({ rigs, game }, state.owner);
  const atName = state.step === 1 && !state.name.trim();

  return (
    <div
      className={"rw-scrim" + (show ? " show" : "")}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="rw-card">
        <div className="rw-handle" />
        <div className="rw-head">
          <div className="rw-title-row">
            <div className="rw-title">◈ Commission a {UNIT_KINDS[state.kind].label}</div>
            <button type="button" className="sheet-gloss-chip" onClick={() => setGlossaryOpen(true)}>
              ⓘ Glossary
            </button>
          </div>
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
