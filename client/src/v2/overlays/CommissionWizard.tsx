import { useEffect, useRef, useState } from "react";
import {
  WEAPONS, EQUIPMENT, canAddRigForSide, WEAPON_UPGRADES, RIG_DEFAULTS, HEAT_CAPACITY,
  UNIT_WEAPONS, CHASSIS, upgradeNature, EQUIPMENT_UPGRADES, equipmentUpgradeNature,
  templatesForKind, templateById,
} from "/shared/game-state.js";
import { UNIT_KINDS, MODULES } from "/shared/unit-kinds.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import { CHASSIS_NAME, weaponGlyph, firstUpgradeId, firstEquipmentUpgradeId, MODULE_BLURB } from "../lib/commissionData";
import { UpgradeLadder } from "./UpgradeLadder";
import type { Rig } from "../../state/types";
import "../styles/forge.css";

type Kind = "rig" | "tank" | "walker";

function stepsFor(kind: Kind): string[] {
  if (kind === "rig") return ["Kind", "Chassis", "Weapons", "Equipment", "Confirm"];
  return ["Kind", "Loadout", "Confirm"];
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
  template: string; // chosen SUPPORT_TEMPLATES id for Tank / Walker
  rigMode: "standard" | "custom"; // Chassis-step pick: Standard auto-commissions, Custom opens the full flow
}

const KIND_GLYPH: Record<Kind, string> = { rig: "◈", tank: "⬛", walker: "⬟" };
const KIND_DESC: Record<Kind, string> = {
  rig: "Heat + weight class + two weapon slots + equipment. 3 actions.",
  tank: "Cold single-model machine. Pre-built loadout + two modules. 2 actions.",
  walker: "Cold walker chassis. Pre-built loadout + two modules. 3 actions, mobile.",
};

export function CommissionWizard({ onClose, editRig }: { onClose: () => void; editRig?: Rig }) {
  const { rigs, game } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();

  // No-mirror invariant (AGENTS.md): a chassis never appears twice on the field.
  // Any chassis already commissioned by either side drops out of the picker; it
  // returns the moment that rig is removed (RigTerminal, pre-battle only).
  const usedChassis = new Set(rigs.map((r) => r.chassis).filter(Boolean));
  // Mediums lead the picker, then lighter frames; ties keep catalogue order.
  const CLASS_ORDER: Record<string, number> = { medium: 0, light: 1 };
  const availableChassis = CHASSIS
    .filter((pb) => !usedChassis.has(pb.id))
    .slice()
    .sort((a, b) => (CLASS_ORDER[a.class] ?? 9) - (CLASS_ORDER[b.class] ?? 9));

  const [state, setState] = useState<WizardState>(() => {
    if (editRig) {
      const eq = editRig.equipment ?? Object.keys(EQUIPMENT)[0];
      return {
        step: 2, // Weapons — first editable step
        kind: "rig",
        cls: editRig.weightClass || "medium",
        owner: editRig.owner || "a",
        chassis: editRig.chassis || "",
        longRange: editRig.weapons?.longRange || "",
        melee: editRig.weapons?.melee || "",
        longRangeUpgrade: editRig.weaponUpgrades?.longRange ?? firstUpgradeId(editRig.weapons?.longRange || ""),
        meleeUpgrade: editRig.weaponUpgrades?.melee ?? firstUpgradeId(editRig.weapons?.melee || ""),
        equipment: eq,
        equipmentUpgrade: editRig.equipmentUpgrade ?? firstEquipmentUpgradeId(eq),
        template: templatesForKind("tank")[0].id,
        rigMode: "custom",
      };
    }
    const pb = availableChassis[0] ?? CHASSIS[0];
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
      template: templatesForKind("tank")[0].id,
      rigMode: "standard",
    };
  });

  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));

  // Selecting a chassis locks weight class + both weapons and resets each weapon
  // to its first upgrade; the player tunes upgrades on the Weapons step.
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
  const minStep = editRig ? 2 : 0; // edit mode skips Kind + Chassis

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
    state.kind === "rig"
      ? (CHASSIS_NAME[state.chassis] || state.cls)
      : (templateById(state.template)?.name || state.cls);

  const submit = () => {
    if (editRig) {
      sendCommand("reconfigure", {
        name: editRig.name,
        owner: editRig.owner || "a",
        longRangeUpgrade: state.longRangeUpgrade,
        meleeUpgrade: state.meleeUpgrade,
        equipment: state.equipment,
        equipmentUpgrade: state.equipmentUpgrade,
      });
      close();
      return;
    }
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
      const t = templateById(state.template);
      sendCommand("add", {
        name: unitName(),
        kind: state.kind,
        owner: state.owner,
        ...(t?.unit ? { unit: t.unit } : {}),
        modules: t?.modules,
      });
    }
    close();
  };

  // One Prototype per rig spans all three pickers (long-range, melee, equipment):
  // each picker's Prototype segment locks whenever a Prototype is spent elsewhere.
  const weaponProto =
    upgradeNature(state.longRange, state.longRangeUpgrade) === "prototype"
    || upgradeNature(state.melee, state.meleeUpgrade) === "prototype";
  const equipProto = equipmentUpgradeNature(state.equipment, state.equipmentUpgrade) === "prototype";

  // A rig with no free chassis can't advance past (or submit from) the picker.
  const chassisBlocked = state.kind === "rig" && availableChassis.length === 0;
  const canAdd = canAddRigForSide({ rigs, game }, state.owner) && !chassisBlocked;
  const canSubmit = editRig ? true : canAdd;

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
              onClick={() => patch({
                kind: k,
                step: 0,
                ...(k !== "rig" ? { template: templatesForKind(k)[0].id } : {}),
              })}
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
  } else if (state.step === 1 && state.kind === "rig") {
    body = (
      <div className="v2-fw-body">
        <div className="v2-fc-cue">
          <span className="v2-fc-cue-lead">◈ Choose your chassis</span>
          <span className="v2-fc-cue-sub v2-eyebrow">— weapons &amp; weight class are fixed by the frame</span>
        </div>
        <div className="v2-fc-roster">
          {availableChassis.map((pb) => {
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
                {sel ? (
                  <div className="v2-fc-mode-panel">
                    <div className="v2-fc-mode-seg" role="radiogroup" aria-label="Build mode">
                      {(["standard", "custom"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={state.rigMode === m}
                          className={"v2-fc-mode-opt" + (state.rigMode === m ? " is-sel" : "")}
                          onClick={() => patch({ rigMode: m })}
                        >
                          <span className="v2-fc-mode-opt-label v2-title">
                            {m === "standard" ? "Standard" : "Custom"}
                          </span>
                          <span className="v2-fc-mode-opt-sub">
                            {m === "standard"
                              ? "Suggested equipment · field-tune weapons · commission now"
                              : "Hand-pick equipment and tune every upgrade"}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="v2-fw-btn"
                      disabled={!canAdd}
                      onClick={() => (state.rigMode === "standard" ? submit() : patch({ step: 2 }))}
                    >
                      {!canAdd ? "Roster full" : state.rigMode === "standard" ? "Commission ▸" : "Next ▸"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {availableChassis.length === 0 && (
            <div className="v2-fw-hint">Every chassis is already commissioned — remove a Rig to free one.</div>
          )}
        </div>
        <div className="v2-fw-hint">
          Weapons and weight class are fixed by the chassis. Pick a frame — you'll tune its weapons next.
        </div>
      </div>
    );
  } else if (state.step === 1) {
    const templates = templatesForKind(state.kind);
    body = (
      <div className="v2-fw-body">
        <div className="v2-fc-cue">
          <span className="v2-fc-cue-lead">◈ Choose a loadout</span>
          <span className="v2-fc-cue-sub v2-eyebrow">— gun &amp; two support modules are fixed by the frame</span>
        </div>
        <div className="v2-fc-grid v2-grid-2">
          {templates.map((t) => {
            const w = t.unit ? UNIT_WEAPONS[t.unit] : null;
            const sel = t.id === state.template;
            return (
              <button
                key={t.id}
                type="button"
                className={"v2-fc-equip" + (sel ? " is-sel" : "")}
                onClick={() => patch({ template: t.id })}
              >
                <div className="v2-fc-equip-family v2-eyebrow">{UNIT_KINDS[t.kind].label}</div>
                <div className="v2-fc-equip-label v2-title">{t.name}</div>
                <div className="v2-fc-equip-passive">
                  {w
                    ? <>{weaponGlyph(t.unit!)} {t.unit} · Penetration {w.pen} · ROF {w.rof}</>
                    : <>⚙ Sidearm · Penetration 4 · ROF 2 — light plinker</>}
                </div>
                <div className="v2-fc-equip-active">
                  {t.modules.map((m) => (
                    <div key={m} className="v2-fc-module">
                      <b>{MODULES[m].label}</b>
                      {MODULE_BLURB[m] ? <> — {MODULE_BLURB[m]}</> : null}
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  } else if (state.step === 2 && state.kind === "rig") {
    const lr = WEAPONS.longRange[state.longRange];
    const ml = WEAPONS.melee[state.melee];
    body = (
      <div className="v2-fw-body">
        <div className="v2-fc-cue">
          <span className="v2-fc-cue-lead">◈ Tune your weapons</span>
          <span className="v2-fc-cue-sub v2-eyebrow">— climb each track; one Prototype per rig</span>
        </div>
        <UpgradeLadder
          title={state.longRange}
          glyph={weaponGlyph(state.longRange)}
          subtitle={`ROF ${lr.rof} · Penetration ${lr.pen} · ${lr.minRange}–${lr.maxRange}"`}
          tiers={WEAPON_UPGRADES[state.longRange] || []}
          selected={state.longRangeUpgrade}
          onSelect={(id) => patch({ longRangeUpgrade: id })}
          lockPrototype={upgradeNature(state.melee, state.meleeUpgrade) === "prototype" || equipProto}
        />
        <UpgradeLadder
          title={state.melee}
          glyph={weaponGlyph(state.melee)}
          subtitle={`ROF ${ml.rof} · Penetration ${ml.pen} · RNG ${ml.rng?.[0]}/${ml.rng?.[1]}"`}
          tiers={WEAPON_UPGRADES[state.melee] || []}
          selected={state.meleeUpgrade}
          onSelect={(id) => patch({ meleeUpgrade: id })}
          lockPrototype={upgradeNature(state.longRange, state.longRangeUpgrade) === "prototype" || equipProto}
        />
      </div>
    );
  } else if (state.step === 2) {
    const t = templateById(state.template);
    const w = t?.unit ? UNIT_WEAPONS[t.unit] : null;
    body = (
      <div className="v2-fw-body v2-fc-confirm">
        <div className="v2-fc-confirm-name v2-title">{unitName()} — {UNIT_KINDS[state.kind].label}</div>
        <div className="v2-fc-confirm-row">
          {w
            ? <>{weaponGlyph(t!.unit!)} {t!.unit} · Penetration {w.pen} · ROF {w.rof}</>
            : <>⚙ Sidearm · Penetration 4 · ROF 2</>}
        </div>
        {t?.modules.map((m) => (
          <div key={m} className="v2-fc-confirm-row">🔧 {MODULES[m].label}</div>
        ))}
      </div>
    );
  } else if (state.step === 3 && state.kind === "rig") {
    body = (
      <div className="v2-fw-body">
        <div className="v2-fc-cue">
          <span className="v2-fc-cue-lead">◈ Fit equipment</span>
          <span className="v2-fc-cue-sub v2-eyebrow">— one slot per rig</span>
        </div>
        <div className="v2-fc-grid v2-grid-2">
          {Object.entries(EQUIPMENT).map(([id, e]) => {
            const suggestion = (content[state.chassis]?.suggestedEquipment || []).find((s) => s.id === id);
            const sel = id === state.equipment;
            return (
              <div key={id} className={"v2-fc-equip-slot" + (sel ? " is-sel" : "")}>
                <button
                  type="button"
                  className={"v2-fc-equip" + (sel ? " is-sel" : "") + (suggestion ? " is-suggested" : "")}
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
                {sel ? (
                  <UpgradeLadder
                    title={e.label}
                    tiers={EQUIPMENT_UPGRADES[id] || []}
                    selected={state.equipmentUpgrade}
                    onSelect={(uid) => patch({ equipmentUpgrade: uid })}
                    lockPrototype={weaponProto}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  } else {
    const e = EQUIPMENT[state.equipment];
    const lrUpgrade = (WEAPON_UPGRADES[state.longRange] || []).find((u) => u.id === state.longRangeUpgrade);
    const meleeUpgrade = (WEAPON_UPGRADES[state.melee] || []).find((u) => u.id === state.meleeUpgrade);
    const equipUpgrade = (EQUIPMENT_UPGRADES[state.equipment] || []).find((u) => u.id === state.equipmentUpgrade);
    // state.step === 4 && state.kind === "rig" — rig Confirm (the only combo left)
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

  // On the rig Chassis step the in-card mode panel owns advancement, so the
  // footer carries Back only; every other step keeps its inline Next/Commission.
  const onChassisStep = state.kind === "rig" && state.step === 1;

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
          <button type="button" className="v2-fw-close v2-close" aria-label="Close" onClick={close}>✕</button>
          <div className="v2-fw-order v2-eyebrow">Commission Order · Form 7-C</div>
          <h2 className="v2-fw-title v2-title">◈ Commission a {UNIT_KINDS[state.kind].label}</h2>
          <div className="v2-fw-rail">
            {STEPS.map((label, i) => (
              i < minStep ? null : (
              <div
                key={label}
                className={"v2-fw-step" + (i === state.step ? " on" : i < state.step ? " done" : "")}
              >
                <span className="v2-fw-step-n">{i - minStep + 1}</span>
                <span className="v2-fw-step-label">{label}</span>
                <span className="v2-fw-step-rail" aria-hidden="true" />
              </div>
              )
            ))}
          </div>
        </div>

        {body}

        <div className="v2-fw-nav">
          {state.step > minStep && (
            <button type="button" className="v2-fw-btn ghost" onClick={() => patch({ step: Math.max(minStep, state.step - 1) })}>
              ◂ Back
            </button>
          )}
          {onChassisStep ? null : state.step < STEPS.length - 1 ? (
            <button type="button" className="v2-fw-btn"
              onClick={() => patch({ step: state.step + 1 })}>
              Next
            </button>
          ) : (
            <button type="button" className="v2-fw-btn cta v2-cta" disabled={!canSubmit} onClick={submit}>
              {editRig ? "Save loadout" : (canSubmit ? "Commission" : "Roster full")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
