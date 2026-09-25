// Glossary: key game terms, highlighted wherever the tutorials and dialogs
// mention them. Hover (our styled tooltip via data-tip) for the meaning.
// rich(text) turns a plain string into nodes with each term's FIRST mention
// wrapped; longest terms match first so "Aimed Shot" beats "Aim".
import { el } from "./dom.js";
import { icon, STAT_ICON } from "./icons.js";

export const GLOSSARY = {
  "Structure Points": "Health of one part of a rig. Each of the four parts has its own pool. At 0 SP the part breaks.",
  "SP": "Structure Points: health of one part (Hull, Arms, Legs, Engine). At 0 the part breaks.",
  "Hull": "The armoured body. Hit on 1-4 of the D12, toughest part. At 0 SP: -2 actions and -1 Aim; hit again and the rig is destroyed.",
  "Arms": "Carry both weapons. Hit on 5-7. At 0 SP a weapon is torn off and its ammo blows (1 damage to Hull and Engine).",
  "Legs": "Speed and turning. Hit on 8-10. At 0 SP: move -3\", turning costs double; hit again and the rig is immobilised.",
  "Engine": "The boiler. Hit on 11-12, least armoured. At 0 SP it skips its next activation; hit again and the rig is destroyed.",
  "Toughness": "A part's armour. Higher Toughness raises the D10 you need to wound it.",
  "Penetration": "How well a weapon punches through armour. Each point lowers the wound roll target by 1 (+10%). Side hits +2, rear +3.",
  "Pen": "Penetration: lowers the wound roll target. Side hits +2, rear +3.",
  "Aimed Shot": "A Fire action at -2 Aim where you choose the part hit instead of rolling the D12.",
  "Aim": "Your to-hit target on the D6. Worse off the weapon's sweet spot, behind cover, or on an Aimed Shot.",
  "sweet spot": "The distance a gun shoots best at. Accuracy drops for every inch closer or further.",
  "Shots": "How many D6 a weapon rolls to hit per attack.",
  "wound": "A hit that gets through the armour: roll a D10 against 6 + Toughness - Penetration.",
  "Damage": "SP a weapon removes per wound.",
  "natural 10": "A 10 on the wound die always wounds, whatever the armour.",
  "natural 6": "A 6 on the to-hit die always hits.",
  "natural 1": "A 1 on the wound die never wounds.",
  "D6": "A six-sided die. Rolled to hit, one per shot.",
  "D10": "A ten-sided die. Rolled to wound, one per hit.",
  "D12": "A twelve-sided die. Rolled once per attack for location: Hull 1-4, Arms 5-7, Legs 8-10, Engine 11-12.",
  "front arc": "The 90° cone a rig faces. It can only attack targets inside its own front arc, and its front is its best armour.",
  "front 90°": "The rig's front arc: it can only attack what's inside this cone.",
  "rear": "Behind the target (beyond ±135°). Hits there get +3 Penetration.",
  "side": "The target's flank (45° to 135° off its facing). Hits there get +2 Penetration.",
  "line of sight": "A clear view from shooter to target. Buildings block it: no line of sight, no shot. Low terrain only gives cover.",
  "cover": "Terrain between you and the target. Light cover -1 Aim, heavy -2.",
  "heat": "Every action stokes the boiler. Past the rig's capacity at the end of a turn, you roll on the overheat table.",
  "capacity": "Heat a rig can hold safely: light 6, medium 5. Ending a turn above it risks an overheat roll.",
  "Shut Down": "Ends the activation and vents heat instead of risking the overheat roll.",
  "overheat": "Ending a turn past heat capacity: roll for effects, from nothing to engine damage.",
  "beacon": "Salvage objective. Holding one alone at round end scores its victory points.",
  "victory points": "Score. Most after 10 rounds wins; wrecking the whole enemy squad wins outright.",
  "activation": "One rig's turn: up to 3 actions, then play passes to the other side.",
  "actions": "What a rig does in its activation: Move, Fire, Prepare... usually 3, each costs heat.",
  "Answer token": "The side acting second each round gets one: place a free face-down reaction before the enemy moves.",
  "reaction": "A face-down trick (Brace, Evasive, Return Fire...) that springs when this rig is attacked.",
  "Prepare": "Spend an action (1 heat) to place a face-down reaction.",
  "Brace": "Reaction: attacks on its front get -2 Penetration until next round.",
  "Disengage": "Spend an action to step out of melee lock.",
  "melee": "Close combat within reach. Rigs in melee are locked together until one disengages.",
  "Sprint": "A longer move for 2 heat instead of 1.",
  "Equipment": "A rig's gadget: an always-on bonus plus one special action.",
  "Lock Sight": "Targeting Computer action: steadies your aim for the next shot.",
  "Toughness 5": "",
};
delete GLOSSARY["Toughness 5"];

const TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RX = new RegExp(`(?<![\\w-])(${TERMS.map(esc).join("|")})(s?)(?![\\w])`, "gi");
const canon = Object.fromEntries(TERMS.map((t) => [t.toLowerCase(), t]));

export function term(word, key = word) {
  const k = canon[key.toLowerCase()] || key;
  return el("span", { class: "gl", "data-tip": `${k}: ${GLOSSARY[k]}` }, STAT_ICON[k] ? icon(STAT_ICON[k], "gl-ico") : null, word);
}

// Plain text -> nodes with glossary terms wrapped (first mention of each).
export function rich(text, seen = new Set()) {
  if (typeof text !== "string") return text;
  const out = []; let last = 0;
  for (const m of text.matchAll(RX)) {
    const k = canon[m[1].toLowerCase()];
    // "SP" and "Pen" only as whole capitalised words; skip repeats.
    if (seen.has(k) || (k.length <= 3 && m[1] !== k)) continue;
    seen.add(k);
    out.push(text.slice(last, m.index), term(m[1] + m[2], k));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}
