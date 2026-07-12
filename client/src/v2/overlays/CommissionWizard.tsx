import { useEffect, useRef, useState } from "react";
import {
  WEAPONS, EQUIPMENT, canAddRigForSide, WEAPON_UPGRADES, RIG_DEFAULTS, HEAT_CAPACITY,
  UNIT_WEAPONS, CHASSIS, upgradeNature, EQUIPMENT_UPGRADES, equipmentUpgradeNature,
} from "/shared/game-state.js";
import { UNIT_KINDS } from "/shared/unit-kinds.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import { CHASSIS_NAME, weaponGlyph, natureLabel, firstUpgradeId, firstEquipmentUpgradeId, NODE_MARK } from "../lib/commissionData";
import "../styles/forge.css";

type Kind = "rig" | "tank" | "walker";

function stepsFor(kind: Kind): string[] {
  if (kind === "rig") return ["Kind", "Chassis", "Equipment", "Confirm"];
  return ["Kind", "Weapon", "Confirm"];
}

// Authored content layered onto a chassis by the server (content/chassis.json).
interface EquipSuggestion { id: string; reason: string; }
interface ChassisContent {
  description?: string; focus?: string; balance?: string; personality?: string;
  suggestedEquipment?: EquipSuggestion[];
}

interface WizardState {
  step: number;
  kind: Kind;
  cls: string;
  owner: string;
  chassis: string; // chosen CHASSIS id; drives cls + longRange + melee
  longRange: string;
  melee: string;
  longRangeUpgrade: string | null;
  meleeUpgrade: string | null;
  equipment: string;
  equipmentUpgrade: string | null;
  unit: string; // flat-pick weapon for Tank / Walker
}

const KIND_GLYPH: Record<Kind, string> = { rig: "◈", tank: "▰", walker: "⧗" };
const KIND_DESC: Record<Kind, string> = {
  rig: "Heat + weight class + two weapon slots + equipment. 3 actions.",
  tank: "Cold single-model machine. One flat-pick weapon. 2 actions.",
  walker: "Cold walker chassis. One flat-pick weapon. 3 actions, mobile.",
};

export function CommissionWizard({ onClose }: { onClose: () => void }) {
  const { rigs, game } = useRoomState();
  const sendCommand = useCommands();
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
      equipmentUpgrade: firstEquipmentUpgradeId(Object.keys(EQUIPMENT)[0]),
      unit: Object.keys(UNIT_WEAPONS)[0],
    };
  });

  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));

  // Selecting a chassis locks weight class + both weapons and resets each weapon
  // to its first upgrade; the player re-picks upgrades in the bay below.
  const selectChassis = (id: string) => {
    const pb = CHASSIS.find((p) => p.id === id);
    if (!pb) return;
    const top = content[id]?.suggestedEquipment?.[0]?.id;
    patch({
      chassis: pb.id,
      cls: pb.class,
      longRange: pb.longRange,
      melee: pb.melee,
      longRangeUpgrade: firstUpgradeId(pb.longRange),
      meleeUpgrade: firstUpgradeId(pb.melee),
      ...(top ? { equipment: top, equipmentUpgrade: firstEquipmentUpgradeId(top) } : {}),
    });
  };

  const STEPS = stepsFor(state.kind);

  // Authored flavour per chassis id, loaded from the server's editable catalogue.
  // Falls back to empty (grid still works off built-in weapons/class) on failure.
  const [content, setContent] = useState<Record<string, ChassisContent>>({});
  useEffect(() => {
    let live = true;
    fetch("/api/chassis")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!live || !data?.chassis) return;
        const map: Record<string, ChassisContent> = {};
        for (const p of data.chassis) {
          map[p.id] = {
            description: p.description, focus: p.focus, balance: p.balance, personality: p.personality,
            suggestedEquipment: Array.isArray(p.suggestedEquipment) ? p.suggestedEquipment : [],
          };
        }
        setContent(map);
        const top = map[state.chassis]?.suggestedEquipment?.[0]?.id;
        if (top) setState((s) => ({ ...s, equipment: top, equipmentUpgrade: firstEquipmentUpgradeId(top) }));
      })
      .catch(() => { /* keep built-in defaults */ });
    return () => { live = false; };
  }, []);

  // Scrim enter/leave: mount without `show`, add it next frame; on close remove
  // `show` and unmount after the transition.
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
        equipmentUpgrade: state.equipmentUpgrade,
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

  // Each weapon renders as a descending Field -> Tuned -> Prototype path. The
  // Prototype node is hazard-lit and gated: one Prototype upgrade per rig, so it
  // locks whenever the OTHER weapon already runs a Prototype upgrade.
  const upgradePath = (
    list: Array<{ id: string; nature: string; name: string; tag: string }>,
    selected: string | null,
    onSelect: (id: string) => void,
    lockPrototype: boolean,
  ) => (
    <div className="v2-fc-path v2-grid-3">
      {list.map((u, i) => {
        const locked = u.nature === "prototype" && lockPrototype && u.id !== selected;
        const isSel = u.id === selected;
        return (
          <button
            key={u.id}
            type="button"
            disabled={locked}
            data-nature={u.nature}
            className={"v2-fc-node nat-" + u.nature + (isSel ? " is-sel" : "") + (locked ? " locked" : "")}
            title={locked ? "A rig may run at most one Prototype upgrade" : u.tag}
            onClick={() => !locked && onSelect(u.id)}
          >
            <span className="v2-fc-node-head">
              <span className="v2-fc-node-mark">{NODE_MARK[i]}</span>
              <span className="v2-fc-node-name v2-title">{u.name}</span>
              <em className={"v2-fc-node-nature nat-" + u.nature + " v2-eyebrow"}>{natureLabel(u.nature)}</em>
            </span>
            <small className="v2-fc-node-tag">
              {u.nature === "prototype" ? <span className="v2-fc-warn">⚠ one per rig</span> : null}
              {u.tag}
            </small>
          </button>
        );
      })}
    </div>
  );

  // The upgrade bay unfolds inside the selected chassis slot (as a sibling of the
  // card <button>, since a button cannot legally nest interactive children).
  const upgradeBay = () => {
    const lr = WEAPONS.longRange[state.longRange];
    const ml = WEAPONS.melee[state.melee];
    return (
      <div className="v2-fc-bay">
        <div className="v2-fc-bay-head v2-title">
          ◈ {CHASSIS_NAME[state.chassis] || state.cls} · Upgrade Bay
          <span className="v2-eyebrow">commit one path per weapon</span>
        </div>
        <div className="v2-fc-weapon">
          <div className="v2-fc-weapon-head">
            <span className="v2-fc-weapon-icon">{weaponGlyph(state.longRange)}</span>
            <span className="v2-fc-weapon-name v2-title">{state.longRange}</span>
            <small className="v2-fc-weapon-stat">ROF {lr.rof} · STR {lr.str} · {lr.minRange}–{lr.maxRange}"</small>
          </div>
          {upgradePath(WEAPON_UPGRADES[state.longRange] || [], state.longRangeUpgrade, (id) =>
            patch({ longRangeUpgrade: id }),
            upgradeNature(state.melee, state.meleeUpgrade) === "prototype"
            || equipmentUpgradeNature(state.equipment, state.equipmentUpgrade) === "prototype",
          )}
        </div>
        <div className="v2-fc-weapon">
          <div className="v2-fc-weapon-head">
            <span className="v2-fc-weapon-icon">{weaponGlyph(state.melee)}</span>
            <span className="v2-fc-weapon-name v2-title">{state.melee}</span>
            <small className="v2-fc-weapon-stat">ROF {ml.rof} · STR {ml.str} · RNG {ml.rng?.[0]}/{ml.rng?.[1]}"</small>
          </div>
          {upgradePath(WEAPON_UPGRADES[state.melee] || [], state.meleeUpgrade, (id) =>
            patch({ meleeUpgrade: id }),
            upgradeNature(state.longRange, state.longRangeUpgrade) === "prototype"
            || equipmentUpgradeNature(state.equipment, state.equipmentUpgrade) === "prototype",
          )}
        </div>
      </div>
    );
  };

  let body: React.ReactNode;
  if (state.step === 0) {
    body = (
      <div className="v2-fw-body">
        <div className="v2-fc-kinds">
          {(["rig", "tank", "walker"] as const).map((k) => (
            <button
              key={k}
              type="button"
              data-kind={k}
              className={"v2-fc-kind" + (k === state.kind ? " is-sel" : "")}
              onClick={() => patch({ kind: k, step: 0 })}
            >
              <span className="v2-fc-kind-top">
                <span className="v2-fc-kind-glyph">{KIND_GLYPH[k]}</span>
                <span className="v2-fc-kind-label v2-title">{UNIT_KINDS[k].label}</span>
              </span>
              <span className="v2-fc-kind-desc">{KIND_DESC[k]}</span>
              {k === state.kind ? <span className="v2-fc-kind-lamp" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (state.step === 1) {
    if (state.kind === "rig") {
      body = (
        <div className="v2-fw-body">
          <div className="v2-fc-cue">
            <span className="v2-fc-cue-lead">◈ Choose your chassis</span>
            <span className="v2-fc-cue-sub v2-eyebrow">— weapons &amp; weight class are fixed by the frame</span>
          </div>
          <div className="v2-fc-roster">
            {CHASSIS.map((pb) => {
              const sel = pb.id === state.chassis;
              return (
                <div key={pb.id} className={"v2-fc-slot" + (sel ? " is-sel" : "")}>
                  <button
                    type="button"
                    data-class={pb.class}
                    className={"v2-fc-card v2-fc-" + pb.class + (sel ? " is-sel" : "")}
                    onClick={() => selectChassis(pb.id)}
                  >
                    <span className="v2-fc-plate">
                      <span className="v2-fc-emblem">{pb.class[0].toUpperCase()}</span>
                      <span className="v2-fc-classshort v2-eyebrow">{pb.class}</span>
                    </span>
                    <span className="v2-fc-info">
                      <span className="v2-fc-tierrow">
                        <span className="v2-fc-tier v2-eyebrow">{pb.class} class</span>
                        <span className="v2-fc-codename v2-title">{CHASSIS_NAME[pb.id] || pb.label}</span>
                      </span>
                      <span className="v2-fc-combo">
                        <i>{weaponGlyph(pb.longRange)}</i> {pb.longRange} <b>·</b> <i>{weaponGlyph(pb.melee)}</i> {pb.melee}
                      </span>
                      {content[pb.id]?.description ? (
                        <span className="v2-fc-desc">{content[pb.id]!.description}</span>
                      ) : null}
                    </span>
                    <span className="v2-fc-rail" aria-hidden="true">
                      <span className="v2-fc-stat"><em>{HEAT_CAPACITY[pb.class]}</em><small className="v2-eyebrow">heat cap</small></span>
                      <span className="v2-fc-stat"><em>{RIG_DEFAULTS[pb.class].hull}</em><small className="v2-eyebrow">hull</small></span>
                      <span className="v2-fc-stat"><em>{RIG_DEFAULTS[pb.class].arms}</em><small className="v2-eyebrow">arms/legs</small></span>
                      <span className="v2-fc-stat"><em>{RIG_DEFAULTS[pb.class].engine}</em><small className="v2-eyebrow">engine</small></span>
                    </span>
                    {sel ? <span className="v2-fc-sel-tag" aria-hidden="true">◈ SEL</span> : null}
                  </button>
                  {sel ? upgradeBay() : null}
                </div>
              );
            })}
          </div>
          <div className="v2-fw-hint">
            Weapons and weight class are fixed by the chassis. Open a chassis and follow each weapon's path to one upgrade — equipment comes next.
          </div>
        </div>
      );
    } else {
      body = (
        <div className="v2-fw-body">
          <div className="v2-fc-cue">
            <span className="v2-fc-cue-lead">◈ Unit weapon</span>
            <span className="v2-fc-cue-sub v2-eyebrow">— one flat-pick armament</span>
          </div>
          <div className="v2-fc-grid v2-grid-2">
            {Object.entries(UNIT_WEAPONS).map(([name, w]: [string, any]) => (
              <button
                key={name}
                type="button"
                className={"v2-fc-equip" + (name === state.unit ? " is-sel" : "")}
                onClick={() => patch({ unit: name })}
              >
                <div className="v2-fc-equip-family v2-eyebrow">{w.melee ? "Melee" : "Ranged"}</div>
                <div className="v2-fc-equip-label v2-title">{name}</div>
                <div className="v2-fc-equip-passive">
                  ROF {w.rof} · STR {w.str} · {w.melee ? `RNG ${w.rng[0]}/${w.rng[1]}"` : `Sweet ${w.sweet}" · ${w.minRange}–${w.maxRange}"`}
                </div>
                <div className="v2-fc-equip-active">{w.perks?.length ? w.perks.join(", ") : "—"}</div>
              </button>
            ))}
          </div>
        </div>
      );
    }
  } else if (state.step === 2) {
    if (state.kind === "rig") {
      // One Prototype per rig spans all three pickers: the equipment Prototype
      // node locks whenever EITHER weapon already runs a Prototype upgrade.
      const weaponPrototype =
        upgradeNature(state.longRange, state.longRangeUpgrade) === "prototype"
        || upgradeNature(state.melee, state.meleeUpgrade) === "prototype";
      body = (
        <div className="v2-fw-body">
          <div className="v2-fc-cue">
            <span className="v2-fc-cue-lead">◈ Fit equipment</span>
            <span className="v2-fc-cue-sub v2-eyebrow">— one slot per rig</span>
          </div>
          <div className="v2-fc-grid v2-grid-2">
            {Object.entries(EQUIPMENT).map(([id, e]) => {
              const suggestion = (content[state.chassis]?.suggestedEquipment || [])
                .find((s) => s.id === id);
              const sel = id === state.equipment;
              return (
                <div key={id} className={"v2-fc-equip-slot" + (sel ? " is-sel" : "")}>
                  <button
                    type="button"
                    className={"v2-fc-equip"
                      + (sel ? " is-sel" : "")
                      + (suggestion ? " is-suggested" : "")}
                    onClick={() => patch({ equipment: id, equipmentUpgrade: firstEquipmentUpgradeId(id) })}
                  >
                    {suggestion && (
                      <div className="v2-fc-equip-suggest">
                        <span className="v2-fc-equip-suggest-tag v2-eyebrow">◈ Suggested</span>
                        <span className="v2-fc-equip-suggest-why">{suggestion.reason}</span>
                      </div>
                    )}
                    <div className="v2-fc-equip-family v2-eyebrow">{e.family}</div>
                    <div className="v2-fc-equip-label v2-title">{e.label}</div>
                    <div className="v2-fc-equip-passive">Passive · {e.passive}</div>
                    <div className="v2-fc-equip-active">
                      Active · <b>{e.active.label}</b> ({e.active.heat >= 0 ? "+" : ""}{e.active.heat} heat) — {e.active.text}
                    </div>
                  </button>
                  {sel ? upgradePath(
                    EQUIPMENT_UPGRADES[id] || [],
                    state.equipmentUpgrade,
                    (uid) => patch({ equipmentUpgrade: uid }),
                    weaponPrototype,
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      );
    } else {
      const w = UNIT_WEAPONS[state.unit];
      body = (
        <div className="v2-fw-body v2-fc-confirm">
          <div className="v2-fc-confirm-name v2-title">{unitName()} — {UNIT_KINDS[state.kind].label}</div>
          <div className="v2-fc-confirm-row">{weaponGlyph(state.unit)} {state.unit} · STR {w.str} · ROF {w.rof}</div>
        </div>
      );
    }
  } else {
    const e = EQUIPMENT[state.equipment];
    const lrUpgrade = (WEAPON_UPGRADES[state.longRange] || []).find((u) => u.id === state.longRangeUpgrade);
    const meleeUpgrade = (WEAPON_UPGRADES[state.melee] || []).find((u) => u.id === state.meleeUpgrade);
    const equipUpgrade = (EQUIPMENT_UPGRADES[state.equipment] || []).find((u) => u.id === state.equipmentUpgrade);
    body = (
      <div className="v2-fw-body v2-fc-confirm">
        <div className="v2-fc-confirm-name v2-title">{unitName()} — {state.cls}</div>
        <div className="v2-fc-confirm-row">{weaponGlyph(state.longRange)} {state.longRange} · {lrUpgrade?.name || "Upgrade ?"}</div>
        <div className="v2-fc-confirm-row">{weaponGlyph(state.melee)} {state.melee} · {meleeUpgrade?.name || "Upgrade ?"}</div>
        <div className="v2-fc-confirm-row">🛠 {e.label} · {equipUpgrade?.name || "Upgrade ?"}</div>
        {content[state.chassis]?.personality ? (
          <div className="v2-fc-confirm-row v2-fc-confirm-flavor">“{content[state.chassis]!.personality}”</div>
        ) : null}
      </div>
    );
  }

  const canAdd = canAddRigForSide({ rigs, game }, state.owner);

  return (
    <div
      className={"v2-fw-scrim v2-scrim v2-scrim--oil" + (show ? " show" : "")}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <section
        className="v2-fw-card v2-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Commission a ${UNIT_KINDS[state.kind].label}`}
      >
        <div className="v2-fw-head">
          <div className="v2-fw-order v2-eyebrow">Commission Order · Form 7-C</div>
          <h2 className="v2-fw-title v2-title">◈ Commission a {UNIT_KINDS[state.kind].label}</h2>
          <div className="v2-fw-rail">
            {STEPS.map((label, i) => (
              <div
                key={label}
                className={"v2-fw-step" + (i === state.step ? " on" : i < state.step ? " done" : "")}
              >
                <span className="v2-fw-step-n">{i + 1}</span>
                <span className="v2-fw-step-label">{label}</span>
                <span className="v2-fw-step-rail" aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>

        {body}

        <div className="v2-fw-nav">
          {state.step > 0 && (
            <button type="button" className="v2-fw-btn ghost" onClick={() => patch({ step: state.step - 1 })}>
              ◂ Back
            </button>
          )}
          {state.step < STEPS.length - 1 ? (
            <button type="button" className="v2-fw-btn" onClick={() => patch({ step: state.step + 1 })}>
              Next
            </button>
          ) : (
            <button type="button" className="v2-fw-btn cta v2-cta" disabled={!canAdd} onClick={submit}>
              {canAdd ? "Commission" : "Roster full"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
