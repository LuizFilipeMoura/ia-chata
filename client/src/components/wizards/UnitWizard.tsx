import { useEffect, useRef, useState } from "react";
import {
  WEAPONS, EQUIPMENT, canAddRigForSide, WEAPON_UPGRADES, RIG_DEFAULTS, HEAT_CAPACITY,
  UNIT_WEAPONS, CHASSIS, upgradeNature,
} from "/shared/game-state.js";
import { UNIT_KINDS } from "/shared/unit-kinds.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import { useUi } from "../../state/UiStateContext";
import { GlossaryText } from "../chat/GlossaryText";

function stepsFor(kind: "rig" | "tank" | "walker"): string[] {
  if (kind === "rig") return ["Kind", "Weapons", "Equipment", "Confirm"];
  return ["Kind", "Weapon", "Confirm"];
}

function firstUpgradeId(name: string): string | null {
  return (WEAPON_UPGRADES[name] || [])[0]?.id || null;
}

// Dieselpunk chassis codenames — each cues its weapon pair + weight class, so a
// rig commissions with a name already attached (the manual name step is gone).
// Derived from the CHASSIS catalogue's `name` field: a new chassis is named the
// moment it's added there, no map to maintain here.
const CHASSIS_NAME: Record<string, string> = Object.fromEntries(
  CHASSIS.map((c: { id: string; name: string }) => [c.id, c.name]),
);

// Weapon -> emblem glyph, used only as a loadout "pip" on the roster cards. Any
// unmapped weapon falls back to a gear so a new weapon never renders blank.
const WEAPON_GLYPH: Record<string, string> = {
  "Autocannon": "🎯", "Mini Gun": "🎯", "Double MG": "🎯", "Sniper Cannon": "🎯",
  "Arc Gun": "⚡", "Mortar": "💥", "Missile Barrage": "🚀", "Siege Maul": "🔨",
  "Claw": "🦾", "Flamethrower": "🔥", "Circular Saw": "🪚", "Chainsaw": "🪚",
  "Wrecking Ball": "⛓️", "Sword": "🗡️", "Lance": "🗡️", "Bulwark Shield": "🛡️",
};
const glyph = (weapon: string) => WEAPON_GLYPH[weapon] || "⚙";
const NODE_MARK = ["I", "II", "III"]; // path rank for each nature step

// Dieselpunk ordnance stamp per upgrade nature (display only — the underlying
// `nature` id still drives the one-Wildcat-per-rig rule). Field = mass-issue,
// Tuned = bench-worked, Prototype = unsanctioned/experimental.
const NATURE_LABEL: Record<string, string> = {
  field: "Standard",
  tuned: "Machined",
  prototype: "Prototype",
};
const natureLabel = (nature: string) => NATURE_LABEL[nature] || nature;

// Authored content layered onto a chassis by the server (content/chassis.json).
interface ChassisContent {
  description?: string; focus?: string; balance?: string; personality?: string;
}

interface WizardState {
  step: number;
  kind: "rig" | "tank" | "walker";
  cls: string;
  owner: string;
  chassis: string; // chosen CHASSIS id; drives cls + longRange + melee
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

  const [state, setState] = useState<WizardState>(() => {
    const pb = CHASSIS[0];
    return {
      step: 0,
      kind: "rig",
      cls: pb.class,
      owner: mySide,
      chassis: pb.id,
      longRange: pb.longRange,
      melee: pb.melee,
      longRangeUpgrade: firstUpgradeId(pb.longRange),
      meleeUpgrade: firstUpgradeId(pb.melee),
      equipment: Object.keys(EQUIPMENT)[0],
      unit: Object.keys(UNIT_WEAPONS)[0],
    };
  });

  // Selecting a chassis locks weight class + both weapons and resets each
  // weapon to its first upgrade; the player re-picks upgrades below the grid.
  // Invariant: the first upgrade per weapon is always Field nature (Task 2), so
  // this reset can never leave the rig with two Prototype upgrades selected.
  const selectChassis = (id: string) => {
    const pb = CHASSIS.find((p) => p.id === id);
    if (!pb) return;
    patch({
      chassis: pb.id,
      cls: pb.class,
      longRange: pb.longRange,
      melee: pb.melee,
      longRangeUpgrade: firstUpgradeId(pb.longRange),
      meleeUpgrade: firstUpgradeId(pb.melee),
    });
  };

  const STEPS = stepsFor(state.kind);

  // Authored description / focus / balance / personality per chassis id, loaded
  // from the server's editable catalogue. Falls back to empty (grid still works
  // off the built-in weapons/class) if the fetch fails.
  const [content, setContent] = useState<Record<string, ChassisContent>>({});
  useEffect(() => {
    let live = true;
    fetch("/api/chassis")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!live || !data?.chassis) return;
        const map: Record<string, ChassisContent> = {};
        for (const p of data.chassis) {
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

  // No manual name step: a rig takes its chassis codename, a tank/walker takes
  // its weapon's name. Server dedupes collisions on commit.
  const unitName = () =>
    state.kind === "rig" ? (CHASSIS_NAME[state.chassis] || state.cls) : state.unit;

  const submit = () => {
    if (state.kind === "rig") {
      sendCommand("add", {
        name: unitName(),
        kind: "rig",
        chassis: state.chassis,
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
        name: unitName(),
        kind: state.kind,
        owner: state.owner,
        unit: state.unit,
      });
    }
    close();
  };

  // The three upgrades render as a descending "path": a rigid → tuned →
  // prototype spine. Later nodes read as higher-commitment; the Prototype node
  // is hazard-lit and gated (one per rig), so it feels dangerous to reach for.
  const upgradePath = (
    name: string,
    selected: string | null,
    onSelect: (id: string) => void,
    otherIsPrototype: boolean,
  ) => (
    <div className="rw-path">
      <span className="rw-path-rail" aria-hidden="true" />
      {(WEAPON_UPGRADES[name] || []).map((u, i) => {
        const locked = u.nature === "prototype" && otherIsPrototype && u.id !== selected;
        const isSel = u.id === selected;
        return (
          <button
            key={u.id}
            type="button"
            disabled={locked}
            data-nature={u.nature}
            className={"rw-node nat-" + u.nature + (isSel ? " sel" : "") + (locked ? " locked" : "")}
            title={locked ? "A rig may run at most one Prototype upgrade" : u.tag}
            onClick={() => !locked && onSelect(u.id)}
          >
            <span className="rw-node-mark">{NODE_MARK[i]}</span>
            <span className="rw-node-body">
              <span className="rw-node-head">
                <span className="rw-node-name">{u.name}</span>
                <em className={"rw-nature rw-nature-" + u.nature}>{natureLabel(u.nature)}</em>
              </span>
              <small className="rw-node-tag">
                {u.nature === "prototype" ? <span className="rw-warn">⚠ one per rig</span> : null}
                <GlossaryText text={u.tag} />
              </small>
            </span>
          </button>
        );
      })}
    </div>
  );

  // The weapon upgrade paths live inside the chosen chassis card as an
  // expandable bay: selecting a roster card unfolds both weapons' Field ->
  // Tuned -> Prototype paths right under its stats, so picks read as part of
  // that chassis. Rendered as a sibling of the card <button> (a button cannot
  // legally nest interactive children).
  const upgradeBay = () => {
    const lr = WEAPONS.longRange[state.longRange];
    const ml = WEAPONS.melee[state.melee];
    return (
      <div className="rc-bay">
        <div className="rc-bay-head">◈ Upgrade paths <span>· commit one per weapon</span></div>
        <div className="rw-weapon">
          <div className="rw-weapon-head">
            <span className="rw-weapon-icon">🎯</span>
            <span className="rw-weapon-name">{state.longRange}</span>
            <small>ROF {lr.rof} · Penetration {lr.pen} · {lr.minRange}–{lr.maxRange}"</small>
          </div>
          {upgradePath(state.longRange, state.longRangeUpgrade, (id) =>
            patch({ longRangeUpgrade: id }),
            upgradeNature(state.melee, state.meleeUpgrade) === "prototype",
          )}
        </div>
        <div className="rw-weapon">
          <div className="rw-weapon-head">
            <span className="rw-weapon-icon">🗡️</span>
            <span className="rw-weapon-name">{state.melee}</span>
            <small>ROF {ml.rof} · Penetration {ml.pen} · RNG {ml.rng?.[0]}/{ml.rng?.[1]}"</small>
          </div>
          {upgradePath(state.melee, state.meleeUpgrade, (id) =>
            patch({ meleeUpgrade: id }),
            upgradeNature(state.longRange, state.longRangeUpgrade) === "prototype",
          )}
        </div>
      </div>
    );
  };

  let body: React.ReactNode;
  if (state.step === 0) {
    body = (
      <div className="rw-body">
        <div className="rw-kind">
          {(["rig", "tank", "walker"] as const).map((k) => (
            <button
              key={k}
              type="button"
              data-kind={k}
              className={"rw-kind-card" + (k === state.kind ? " sel" : "")}
              onClick={() => patch({ kind: k, step: 0 })}
            >
              <span className="rw-kind-glyph">{k === "rig" ? "◈" : k === "tank" ? "▰" : "⧗"}</span>
              <span className="rw-kind-family">Chassis</span>
              <span className="rw-kind-label">{UNIT_KINDS[k].label}</span>
              <span className="rw-kind-desc">
                {k === "rig"
                  ? "Heat + weight class + two weapon slots + equipment. 3 actions."
                  : k === "tank"
                  ? "Cold single-model machine. One flat-pick weapon. 2 actions."
                  : "Cold walker chassis. One flat-pick weapon. 3 actions, mobile."}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  } else if (state.step === 1) {
    if (state.kind === "rig") {
      body = (
        <div className="rw-body">
          <div className="rw-field">
            <label className="rw-roster-cue">Choose your chassis · unfold its upgrade paths</label>
            <div className="rw-roster">
              {CHASSIS.map((pb) => {
                const sel = pb.id === state.chassis;
                return (
                  <div key={pb.id} className={"rc-slot" + (sel ? " sel" : "")}>
                    <button
                      type="button"
                      data-class={pb.class}
                      className={"rc-card rc-" + pb.class + (sel ? " sel" : "")}
                      onClick={() => selectChassis(pb.id)}
                    >
                      <span className="rc-frame" aria-hidden="true" />
                      <span className="rc-plate">
                        <span className="rc-emblem">{pb.class[0].toUpperCase()}</span>
                        <span className="rc-pips">
                          <i>{glyph(pb.longRange)}</i><i>{glyph(pb.melee)}</i>
                        </span>
                      </span>
                      <span className="rc-info">
                        <span className="rc-tierrow">
                          <span className="rc-tier">{pb.class}</span>
                          <span className="rc-tier-sep">class</span>
                          <span className="rc-heat">heat cap {HEAT_CAPACITY[pb.class]}</span>
                        </span>
                        <span className="rc-label">{CHASSIS_NAME[pb.id] || pb.label}</span>
                        <span className="rc-combo">
                          <i>{glyph(pb.longRange)}</i> {pb.longRange} <b>·</b> <i>{glyph(pb.melee)}</i> {pb.melee}
                        </span>
                        <span className="rc-stats">
                          Hull {RIG_DEFAULTS[pb.class].hull} · Arms/Legs {RIG_DEFAULTS[pb.class].arms} · Engine {RIG_DEFAULTS[pb.class].engine}
                        </span>
                        {content[pb.id]?.description ? (
                          <span className="rc-desc">{content[pb.id]!.description}</span>
                        ) : null}
                      </span>
                      <span className="rc-picked" aria-hidden="true">◈ Selected</span>
                    </button>
                    {sel ? upgradeBay() : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rw-hint">
            Weapons and weight class are fixed by the chassis. Open a chassis and follow each weapon's path to one upgrade — equipment comes next.
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
                    ROF {w.rof} · Penetration {w.pen} · {w.melee ? `RNG ${w.rng[0]}/${w.rng[1]}"` : `Sweet ${w.sweet}" · ${w.minRange}–${w.maxRange}"`}
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
  } else if (state.step === 2) {
    if (state.kind === "rig") {
      // Equipment — its own step again (upgrades moved into the chassis bay).
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
          <div className="rw-confirm-name">{unitName()} — {UNIT_KINDS[state.kind].label}</div>
          <div className="rw-confirm-row">🎯 {state.unit} · Penetration {w.pen} · ROF {w.rof}</div>
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
        <div className="rw-confirm-name">{unitName()} — {state.cls}</div>
        <div className="rw-confirm-row">🎯 {state.longRange} · {lrUpgrade?.name || "Upgrade ?"}</div>
        <div className="rw-confirm-row">🗡️ {state.melee} · {meleeUpgrade?.name || "Upgrade ?"}</div>
        <div className="rw-confirm-row">🛠 {e.label} · {e.passive}</div>
        {content[state.chassis]?.personality ? (
          <div className="rw-confirm-row rw-confirm-flavor">“{content[state.chassis]!.personality}”</div>
        ) : null}
      </div>
    );
  }

  const canAdd = canAddRigForSide({ rigs, game }, state.owner);

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
