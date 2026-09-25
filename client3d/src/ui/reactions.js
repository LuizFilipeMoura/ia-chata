// Reaction picker: illustrated cards for the face-down reactions (Prepare and
// the round's free Answer token). Each card says WHEN it triggers, WHAT it does
// and WHEN to pick it, with an engraved-brass emblem so the choice reads at a
// glance. Rigs are picked from portrait cards, not a dropdown.
import { el } from "./dom.js";
import { LOCS } from "/shared/game-state.js";

// Emblems: simple engraved-line drawings (stroke = currentColor).
const ART = {
  brace: `<path d="M32 6 L54 14 V30 C54 44 44 54 32 58 C20 54 10 44 10 30 V14 Z"/><path d="M32 16 V48 M20 26 H44" opacity=".6"/><circle cx="32" cy="32" r="4"/>`,
  evasive: `<path d="M14 44 C24 44 26 20 40 20" /><path d="M36 14 L42 20 L36 26"/><path d="M8 30 H20 M6 38 H16 M10 22 H18" opacity=".6"/><circle cx="48" cy="44" r="6" stroke-dasharray="3 3"/>`,
  return: `<circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="6"/><path d="M32 8 V18 M32 46 V56 M8 32 H18 M46 32 H56"/><path d="M50 12 L42 20 M50 12 H43 M50 12 V19"/>`,
  riposte: `<path d="M12 52 L46 18 M46 18 L52 12 M40 16 L48 24"/><path d="M52 52 L18 18 M18 18 L12 12 M24 16 L16 24"/><path d="M28 40 L36 40" opacity=".6"/>`,
  sidestep: `<path d="M18 50 c-4 -2 -4 -10 0 -12 c4 -2 8 4 4 8 z"/><path d="M34 30 c-4 -2 -4 -10 0 -12 c4 -2 8 4 4 8 z"/><path d="M44 50 L54 40 M54 40 H47 M54 40 V47"/><path d="M8 20 H24" opacity=".5" stroke-dasharray="3 3"/>`,
  exploit: `<circle cx="32" cy="32" r="20"/><path d="M32 12 L28 26 L36 30 L30 44 L34 52"/><path d="M44 18 L50 12 M20 46 L14 52" opacity=".6"/>`,
  "raise-shield": `<rect x="14" y="10" width="36" height="44" rx="4"/><path d="M14 22 H50 M14 34 H50 M14 46 H50" opacity=".6"/><circle cx="32" cy="28" r="3"/>`,
};

export const REACTIONS = {
  brace: { name: "Brace", when: "The next time this rig is hit.", does: "Takes the blow on braced armour: less damage from that hit.", pick: "Safe default. Pick it when you're not sure." },
  evasive: { name: "Evasive Manoeuvre", when: "When an attack is declared against it.", does: "Dodges (D6, 4+): the attack misses completely.", pick: "A coin flip that can erase a big hit. Good on fragile rigs." },
  return: { name: "Return Fire", when: "When an enemy attacks it.", does: "Shoots straight back at the attacker, if it can bear on them.", pick: "For rigs with a gun facing where enemies will come from." },
  riposte: { name: "Riposte", when: "When an enemy strikes it in melee.", does: "Counter-strikes the attacker before they can follow up.", pick: "For brawlers expecting a melee charge." },
  sidestep: { name: "Sidestep", when: "When an enemy charges into contact.", does: "Slips away from the charge instead of being locked in melee.", pick: "For ranged rigs that must not get pinned." },
  exploit: { name: "Exploit Opening", when: "When an overcommitted enemy attacks it (last action, or overheated).", does: "Turns to face and fires a free aimed counter-shot at a location of your choice.", pick: "Punishes greedy attackers. Best when the enemy runs hot." },
  "raise-shield": { name: "Raise Shield", when: "The next hit from the front.", does: "The Bulwark takes the blow instead of the rig.", pick: "Only the shield rig. Excellent against a frontal assault." },
};

// What an Improved (Grit) version adds, per reaction.
export const IMPROVED = {
  brace: "−3 Penetration on front hits (instead of −2).",
  "raise-shield": "Side and rear hits at −4 Penetration (instead of −3).",
  evasive: "Dodges on 3+ (instead of 4+).",
  sidestep: "Slips away on 3+ (instead of 4+).",
  return: "Its counter-attack gets +2 Penetration.",
  riposte: "Its counter-strike gets +2 Penetration.",
  exploit: "Its counter-shot gets +2 Penetration.",
};

export function reactionCard(key, { selected = false, improved = false, onClick } = {}) {
  const r = REACTIONS[key] || { name: key, when: "", does: "", pick: "" };
  const art = el("div", { class: "rx-art" });
  art.innerHTML = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${ART[key] || ART.brace}</svg>`;
  return el("button", { class: `rx-card ${selected ? "on" : ""} ${improved ? "improved" : ""}`, onClick },
    art,
    el("div", { class: "rx-body" },
      el("div", { class: "rx-name" }, improved ? el("span", { class: "rx-imp" }, "IMPROVED ") : null, r.name),
      improved && IMPROVED[key] ? el("div", { class: "rx-row rx-imp-row" }, el("span", { class: "rx-k" }, "Grit"), el("span", {}, IMPROVED[key])) : null,
      el("div", { class: "rx-row" }, el("span", { class: "rx-k" }, "Triggers"), el("span", {}, r.when)),
      el("div", { class: "rx-row" }, el("span", { class: "rx-k" }, "Effect"), el("span", {}, r.does)),
      el("div", { class: "rx-tip" }, r.pick)));
}

export function rigPortrait(rig, { selected = false, onClick } = {}) {
  const tot = LOCS.reduce((a, l) => a + (rig[l]?.sp || 0), 0), max = LOCS.reduce((a, l) => a + (rig[l]?.max || 0), 0) || 1;
  return el("button", { class: `rx-rig ${selected ? "on" : ""}`, onClick },
    el("span", { class: `swatch big sw-${rig.name}` }),
    el("div", {}, el("div", { class: "rx-name" }, rig.name), el("div", { class: "muted small" }, `${rig.weapons?.longRange} · ${rig.weapons?.melee}`),
      el("div", { class: "bar" }, el("i", { style: { width: `${(tot / max) * 100}%`, background: tot / max > 0.6 ? "#7fcf6a" : tot / max > 0.3 ? "#f5b041" : "#e0533d" } }))));
}
