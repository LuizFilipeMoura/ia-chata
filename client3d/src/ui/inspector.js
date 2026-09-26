// Rig inspector: click any rig (live battle, replay, Watch) to see everything
// about it in one panel: chassis, class, speed, health per location, heat,
// both weapons with their stats, the upgrades it carries (type + effect),
// equipment, and what's affecting it right now.
import { el, fill } from "./dom.js";
import { CHASSIS, WEAPONS, WEAPON_UPGRADES, EQUIPMENT, LOCS, UNIT_WEAPONS, SUPPORT_REACH, PAINT_RANGE } from "/shared/game-state.js";
import { isRig, partsOf, unitLabel } from "../game/units.js";
import { EQUIPMENT_UPGRADES, HEAT_CAPACITY } from "/shared/rules.js";
import { toughnessOf } from "/shared/unit-kinds.js";
import { equipmentChips } from "/shared/battle-view.js";
import { icon } from "./icons.js";
import { rich } from "./glossary.js";

const NATURE = { field: ["Field", "always on"], tuned: ["Tuned", "pays off in the right situation"], prototype: ["Prototype", "powerful, with a catch"] };
const LOC_NAME = { hull: "Hull", arms: "Arms", legs: "Legs", engine: "Engine", mount: "Gun mount" };
const LOC_HELP = {
  hull: "At 0: the rig loses 2 actions and aims worse.",
  arms: "At 0: a weapon is torn off.",
  legs: "At 0: movement is crippled.",
  engine: "At 0: the rig skips its next activation.",
  mount: "At 0: its gun is wrecked.",
};
const MODULE_HELP = {
  repair: `Field Weld: repair an ally within ${SUPPORT_REACH}" (D6 SP onto one part).`,
  coolant: `Vent: pull 2 heat off an allied rig within ${SUPPORT_REACH}".`,
  recon: `Paint: mark an enemy in sight within ${PAINT_RANGE}" (allies ignore its cover, +1 Aim).`,
};

function upgrade(list, id) {
  const u = (list || []).find((x) => x.id === id);
  if (!u) return null;
  const [n, help] = NATURE[u.nature] || [u.nature, ""];
  return el("div", { class: "in-up" }, el("div", {}, el("b", {}, u.name), el("span", { class: `in-nat n-${u.nature}`, title: `${n}: ${help}` }, n)),
    el("div", { class: "muted" }, rich(u.tag)), u.catch ? el("div", { class: "in-catch" }, `Catch: ${u.catch}`) : null);
}

function weapon(slot, name, upId) {
  const w = WEAPONS[slot]?.[name] || UNIT_WEAPONS[name];
  if (!w) return null;
  const range = slot === "melee" ? `reach ${w.rng?.[0] ?? 2}"` : `range ${w.minRange ? `${w.minRange}-` : ""}${w.maxRange}", sweet band ${w.band ? `${w.band[0]}–${w.band[1]}" (+${w.bandAcc})` : `~${w.sweet}"`}${w.close ? `, −${-w.close.acc} under ${w.close.under}"` : ""}`;
  return el("div", { class: "in-wep" },
    el("div", { class: "in-wh" }, icon(slot === "melee" ? "melee" : "fire"), el("b", {}, name), el("span", { class: "muted" }, slot === "melee" ? " melee" : " long-range")),
    el("div", { class: "in-stats" },
      el("span", { title: "Shots: dice rolled to hit per attack" }, el("i", {}, icon("shots"), "Shots"), w.rof),
      el("span", { title: "Penetration: how easily a hit wounds (vs the target's Toughness)" }, el("i", {}, icon("pen"), "Pen"), w.pen),
      el("span", { title: "Damage per wound" }, el("i", {}, icon("dmg"), "Dmg"), w.dmg),
      el("span", { title: slot === "melee" ? "Melee reach from base edge" : "Firing range; +Accuracy inside the sweet band, flat elsewhere" }, el("i", {}, icon(slot === "melee" ? "reach" : "range"), slot === "melee" ? "Reach" : "Range"), range)),
    (w.perks || []).length ? el("div", { class: "muted small" }, "Keywords: ", rich(w.perks.join(", "))) : null,
    upgrade(WEAPON_UPGRADES[name], upId));
}

// rig: a publicState rig, or a replay frame rig plus its `loadout` (squad entry).
export function openInspector(rig, { loadout = null, onClose } = {}) {
  document.querySelector(".inspector")?.remove();
  if (!isRig(rig)) return openUnitInspector(rig, { onClose });
  const ch = CHASSIS.find((c) => c.id === rig.chassis) || {};
  const lr = rig.weapons?.longRange ?? ch.longRange, me = rig.weapons?.melee ?? ch.melee;
  const lrUp = rig.weaponUpgrades?.longRange ?? loadout?.longRangeUpgrade ?? WEAPON_UPGRADES[lr]?.[0]?.id;
  const meUp = rig.weaponUpgrades?.melee ?? loadout?.meleeUpgrade ?? WEAPON_UPGRADES[me]?.[0]?.id;
  const eq = rig.equipment ?? loadout?.equipment ?? null;
  const eqUp = rig.equipmentUpgrade ?? loadout?.equipmentUpgrade ?? null;
  const sp = (l) => (Array.isArray(rig.sp?.[l]) ? rig.sp[l] : [rig[l]?.sp ?? 0, rig[l]?.max ?? 0]);
  const heat = rig.heat ?? rig.engine?.heat ?? 0, cap = HEAT_CAPACITY[ch.class] ?? 6;
  const status = [
    rig.destroyed && "💥 Destroyed",
    rig.activated && "✓ Already acted this round",
    rig.preparation && (rig.preparation.hidden ? "🛡 Has a hidden reaction ready" : `🛡 Reaction ready: ${rig.preparation.type}`),
    rig.engagedWith != null && "⚔ Locked in melee (must Disengage to move)",
    rig.loaded?.longRange === false && "🔄 Gun is empty (needs Reload)",
    heat > cap && `🔥 Over heat capacity (${heat}/${cap})`,
  ].filter(Boolean);

  const panel = el("div", { class: "inspector" },
    el("div", { class: "in-head" }, el("span", { class: `swatch big sw-${rig.name}` }),
      el("div", {}, el("h2", {}, rig.name), el("div", { class: "muted" }, `${ch.class === "medium" ? "Medium" : "Light"} rig · speed ${ch.speed ?? "?"}" · ${rig.owner === "a" ? "Cyan" : "Red"} side`)),
      el("button", { class: "btn ghost in-x", onClick: () => { panel.remove(); onClose?.(); } }, "✕")),
    status.length ? el("div", { class: "in-status" }, status.map((t) => el("div", {}, t))) : null,
    el("h4", {}, icon("sp"), "Structure"),
    el("div", { class: "in-legend" }, icon("tough"), "Toughness (armour) · bar = SP left"),
    el("div", { class: "in-sp" }, LOCS.map((l) => {
      const [v, m] = sp(l); const f = m ? v / m : 0;
      return el("div", { class: "in-loc", title: `${LOC_NAME[l]}: ${v} of ${m} structure points\n${LOC_HELP[l]}` },
        el("span", {}, LOC_NAME[l]), el("span", { class: "in-t", title: `Toughness (armour): wound rolls need 6 + ${toughnessOf("rig", l, ch.class)} − Penetration` }, icon("tough"), `${toughnessOf("rig", l, ch.class)}`), el("div", { class: "bar" }, el("i", { style: { width: `${f * 100}%`, background: f > 0.6 ? "#7fcf6a" : f > 0.3 ? "#f5b041" : "#e0533d" } })), el("b", {}, `${v}/${m}`));
    })),
    el("div", { class: "in-loc", title: "Boiler heat\nEvery action adds heat; 1 cools per round. Ending a turn past capacity risks engine damage." },
      el("span", {}, icon("heat"), "Heat"), el("div", { class: "bar" }, el("i", { style: { width: `${Math.min(100, (heat / (cap + 4)) * 100)}%`, background: heat > cap ? "#ff3d1f" : "#f5b041" } })), el("b", {}, `${heat}/${cap}`)),
    el("h4", {}, "Weapons"),
    weapon("longRange", lr, lrUp),
    weapon("melee", me, meUp),
    el("h4", {}, "Equipment"),
    eq && EQUIPMENT[eq] ? el("div", { class: "in-wep" },
      el("div", { class: "in-wh" }, el("span", {}, "⚙"), el("b", {}, EQUIPMENT[eq].label), el("span", { class: "muted" }, ` ${EQUIPMENT[eq].family || ""}`)),
      el("div", {}, el("i", { class: "muted" }, "Always: "), EQUIPMENT[eq].passive),
      el("div", {}, el("i", { class: "muted" }, `Action "${EQUIPMENT[eq].active.label}" (${EQUIPMENT[eq].active.heat} heat): `), EQUIPMENT[eq].active.text),
      upgrade(EQUIPMENT_UPGRADES[eq], eqUp)) : el("p", { class: "muted" }, "None fitted."),
    // Live equipment state: charges, banks, stacks, cooldowns, one-shot flags.
    (() => {
      const chips = rig.destroyed ? [] : equipmentChips(rig);
      return chips.length ? el("div", { class: "in-eqstate" }, el("h4", {}, "Equipment state"), chips.map((c) =>
        el("div", { class: `in-eqc t-${c.tone}`, title: c.tip }, icon(c.icon), el("b", {}, c.label), el("span", { class: "muted" }, c.tip)))) : null;
    })());
  document.body.append(panel);
  return panel;
}

// Walkers and drones: parts, the one weapon, the support modules.
function openUnitInspector(rig, { onClose } = {}) {
  const sp = (l) => (Array.isArray(rig.sp?.[l]) ? rig.sp[l] : [rig[l]?.sp ?? 0, rig[l]?.max ?? 0]);
  const kind = rig.kind || "walker";
  const u = rig.weapons?.unit ?? rig.unit;
  const mods = (rig.modules || []).filter((m) => MODULE_HELP[m]);
  const panel = el("div", { class: "inspector" },
    el("div", { class: "in-head" }, icon(kind === "drone" ? "drone" : "walker"),
      el("div", {}, el("h2", {}, rig.name), el("div", { class: "muted" }, `${unitLabel(rig)} · speed ${rig.speed ?? "?"}" · ${rig.owner === "a" ? "Cyan" : "Red"} side · no boiler, never runs hot`)),
      el("button", { class: "btn ghost in-x", onClick: () => { panel.remove(); onClose?.(); } }, "✕")),
    rig.destroyed ? el("div", { class: "in-status" }, el("div", {}, "💥 Destroyed")) : null,
    kind === "drone" ? el("p", { class: "muted" }, "A drone: wrecking it scores no VP, and it never keeps its side in the fight.") : null,
    el("h4", {}, icon("sp"), "Structure"),
    el("div", { class: "in-sp" }, partsOf(rig).map((l) => {
      const [v, m] = sp(l); const f = m ? v / m : 0;
      return el("div", { class: "in-loc", title: `${LOC_NAME[l] || l}: ${v} of ${m} structure points\n${LOC_HELP[l] || ""}` },
        el("span", {}, LOC_NAME[l] || l), el("span", { class: "in-t" }, icon("tough"), `${toughnessOf(kind, l)}`), el("div", { class: "bar" }, el("i", { style: { width: `${f * 100}%`, background: f > 0.6 ? "#7fcf6a" : f > 0.3 ? "#f5b041" : "#e0533d" } })), el("b", {}, `${v}/${m}`));
    })),
    el("h4", {}, "Weapon"),
    u ? weapon(UNIT_WEAPONS[u]?.melee ? "melee" : "longRange", u, null) : el("p", { class: "muted" }, "Unarmed."),
    UNIT_WEAPONS[u]?.detonate ? el("p", {}, `Demo Charge: after the blow it blasts every other unit within ${UNIT_WEAPONS[u].detonate.radius}" (Penetration ${UNIT_WEAPONS[u].detonate.pen} / ${UNIT_WEAPONS[u].detonate.dmg}) and the drone is gone.`) : null,
    mods.length ? el("h4", {}, "Support modules") : null,
    mods.map((m) => el("div", { class: "in-wep" }, el("div", {}, icon(m === "repair" ? "fieldweld" : m === "coolant" ? "vent" : "paint"), " ", MODULE_HELP[m]))));
  document.body.append(panel);
  return panel;
}
