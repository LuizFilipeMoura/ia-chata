// Reference cards for the Training Grounds: weapon keywords, the three upgrade
// natures, and equipment. Text mirrors rules.md §13/§15 and the live data.
import { el } from "./dom.js";
import { icon } from "./icons.js";
import { rich } from "./glossary.js";
import { EQUIPMENT, WEAPON_UPGRADES } from "/shared/game-state.js";

export const KEYWORDS = [
  { k: "Raking Fire", ic: "fire", on: "Mini Gun, Double MG", t: "Can't wound a target's front arc at all. Side hits get +3 Penetration, rear +6 (instead of +2/+3). Flank or waste the shot." },
  { k: "Armour Piercing", ic: "pen", on: "AP Shells, Shaped Charges, some melee Field upgrades", t: "Reroll every failed wound roll. More wounds land; each still deals normal Damage." },
  { k: "Rend", ic: "dmg", on: "Chainsaw, Claw, Flamethrower (Field upgrades)", t: "Each wound deals +1 Damage. Depth, not frequency." },
  { k: "Precision", ic: "aimed", on: "Crossbow, Sniper Cannon, Sword (Field upgrades)", t: "Aimed Shots without the −3 Aim penalty: pick the part for free." },
  { k: "Shock", ic: "legs", on: "Mini Gun (Suppressive Fire)", t: "On a hit, the target's movement is halved on its next activation." },
  { k: "Incendiary", ic: "heat", on: "Arc Gun (Ion Burn)", t: "On a hit, the target gains 1 heat. Push them toward an overheat." },
  { k: "Impale", ic: "anchor", on: "Harpoon, Claw (Vice Grip)", t: "On a hit roll a D12: on 8+ the target is pinned in place until your next activation (it can still turn)." },
  { k: "Bulwark", ic: "prepare", on: "Bulwark Shield", t: "Unlocks the Raise Shield reaction: negates a front-arc attack, −3 Penetration from side or rear." },
];

export const keywordCards = (only) => el("div", { class: "kw-grid" }, KEYWORDS.filter((x) => !only || only.includes(x.k)).map((x) =>
  el("div", { class: "kw" }, el("div", { class: "kw-h" }, icon(x.ic), el("b", {}, x.k)), el("div", { class: "kw-t" }, rich(x.t)), el("div", { class: "kw-on" }, "On: ", x.on))));

const NATURE = {
  field: ["Field", "Always on. No conditions, no bookkeeping. Never a trap pick."],
  tuned: ["Tuned", "Conditional: beats Field when its trigger is set up, weak when it isn't."],
  prototype: ["Prototype", "A new mechanic with a counter, cadence or zone. Big payoff, real bookkeeping, and it may carry a downside. Max ONE per rig."],
};
export const natureCards = (weapon = "Autocannon") => el("div", { class: "nat-grid" }, (WEAPON_UPGRADES[weapon] || []).map((u) =>
  el("div", { class: `nat n-${u.nature}` },
    el("div", { class: "nat-h" }, el("span", { class: `in-nat n-${u.nature}` }, NATURE[u.nature][0]), el("b", {}, u.name)),
    el("div", { class: "kw-t" }, rich(u.tag)),
    u.catch ? el("div", { class: "nat-catch" }, "Catch: ", u.catch) : null,
    el("div", { class: "kw-on" }, NATURE[u.nature][1]))));

const EQ_ICON = { Armor: "harden", Cooling: "purge", Mobility: "jumpjets", Power: "overclock", Utility: "repair", Thermal: "heat", "Fire Control": "aimed", Countermeasures: "smoke" };
export const equipmentCards = () => el("div", { class: "kw-grid" }, Object.values(EQUIPMENT).map((e) =>
  el("div", { class: "kw" },
    el("div", { class: "kw-h" }, icon(EQ_ICON[e.family] || "sp"), el("b", {}, e.label), el("span", { class: "kw-fam" }, e.family)),
    el("div", { class: "kw-t" }, el("i", {}, "Always: "), rich(e.passive)),
    el("div", { class: "kw-t" }, el("i", {}, `${e.active.label} (${e.active.heat} heat): `), rich(e.active.text)))));
