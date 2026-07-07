// Pure, DOM-free view-model derived from room state. Shared so it can be unit
// tested in node and imported by the browser (via the /shared static mount).
import { ACTIONS } from "./rules.js";
import { EQUIPMENT } from "./game-state.js";
import { UNIT_KINDS, kindOf, partsByRole } from "./unit-kinds.js";

const ACTION_ORDER = ["move", "sprint", "fire", "aimed", "reload", "repair", "prepare", "shutdown"];

// The action console list for the active rig: each action with its heat cost and
// whether the current budget/state allows it.
export function availableActions(rig, turn) {
  const cfg = UNIT_KINDS[kindOf(rig)];
  const left = turn.actionsMax - turn.actionsUsed;
  // Rig uses two slots (longRange + melee); flat-pick uses one "unit" slot.
  const rangedSpent = cfg.weaponMode === "flat-pick"
    ? rig.loaded?.unit === false
    : rig.loaded?.longRange === false;
  const firedRanged = (turn.longRangeShots || 0) >= 1;
  const list = ACTION_ORDER
    .filter((key) => {
      if (key === "shutdown" && !cfg.hasHeat) return false;
      if (key === "prepare" && !cfg.reactions) return false;
      return true;
    })
    .map((key) => {
      const def = ACTIONS[key];
      let enabled = left > 0;
      let cost = def.slot;
      let heat = def.heat;
      let note = "";
      if (key === "shutdown") enabled = true; // available any time; cools proportional to slots used
      if (key === "reload") {
        enabled = left > 0 && rangedSpent;
        if (!rangedSpent) note = "Weapons already loaded";
      }
      if (key === "fire" || key === "aimed") {
        if (rangedSpent) {
          enabled = false;
          note = "Ranged weapon spent — reload before firing again";
        } else if (firedRanged) {
          heat = def.heat + 1;
          note = "Second shot — +1 heat";
        }
      }
      return { key, label: def.label, heat, enabled, cost, note };
    });
  if (cfg.hasEquipment && rig.equipment && EQUIPMENT[rig.equipment]) {
    const active = EQUIPMENT[rig.equipment].active;
    list.push({ key: active.key, label: active.label, heat: active.heat, enabled: left > 0, cost: 1, note: "" });
  }
  return list;
}

export function actionBudget(rig, turn) {
  const [structPart] = partsByRole(kindOf(rig), "structural");
  return {
    used: turn.actionsUsed, max: turn.actionsMax,
    left: Math.max(0, turn.actionsMax - turn.actionsUsed),
    reduced: !!structPart && rig[structPart]?.sp === 0,
  };
}

// Every active value-changing modifier, as { key, tag, tone } for chip rendering.
export function rigModifiers(rig) {
  const kind = kindOf(rig);
  const cfg = UNIT_KINDS[kind];
  const [structPart] = partsByRole(kind, "structural");
  const [powerPart]  = partsByRole(kind, "power");
  const [mobPart]    = partsByRole(kind, "mobility");
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  const mods = [];
  if (structPart && rig[structPart].sp === 0 && !rig[structPart].destroyed)
    mods.push({ key: `${structPart}0`, tag: `${cap(structPart)} 0 · −2 actions −1 Aim`, tone: "crit" });
  if (cfg.hasHeat && powerPart && rig[powerPart].sp === 0 && !rig[powerPart].destroyed)
    mods.push({ key: `${powerPart}0`, tag: `${cap(powerPart)} 0 · heat ≥3`, tone: "crit" });
  if (mobPart && rig[mobPart].sp === 0 && !rig.immobilised)
    mods.push({ key: `${mobPart}0`, tag: `${cap(mobPart)} 0 · −3\" move`, tone: "warn" });
  if (rig.immobilised) mods.push({ key: "immobile", tag: "Immobilised", tone: "crit" });
  if (rig.noCool) mods.push({ key: "nocool", tag: "No cooling", tone: "crit" });
  if (rig.speedHalvedNextRound) mods.push({ key: "speed", tag: "Speed halved", tone: "warn" });
  if (rig.skipNextActivation) mods.push({ key: "skip", tag: "Skips next activation", tone: "warn" });
  if (cfg.reactions && rig.preparation) {
    const p = rig.preparation;
    const tag = p.hidden || p.faceUp === false ? "Reaction set" : prepLabel(p.type);
    mods.push({ key: "prep", tag, tone: "prep" });
  }
  for (const w of rig.weaponsDestroyed || []) mods.push({ key: "weapon", tag: `Weapon lost: ${w}`, tone: "warn" });
  if (rig.loaded && rig.loaded.longRange === false) mods.push({ key: "unloaded", tag: "Ranged unloaded", tone: "warn" });
  return mods;
}

function prepLabel(type) {
  if (type === "evasive") return "Evasive ready";
  if (type === "return") return "Return fire ready";
  return "Braced";
}

const PHASE_LABELS = { setup: "Setup", initiative: "Initiative", activation: "Activation", recovery: "Recovery", finished: "Battle over" };

export function phaseSummary(game, rigs) {
  const turn = game.turn;
  const side = turn && game.sides.find((s) => s.id === turn.side);
  const active = turn && turn.activeRigId ? rigs.find((r) => r.id === turn.activeRigId) : null;
  return {
    label: PHASE_LABELS[game.phase] || game.phase,
    phase: game.phase,
    round: game.round,
    turnSide: turn?.side || null,
    turnName: side?.name || null,
    activeName: active?.name || null,
    answerTokens: game.answerTokens || { a: 0, b: 0 },
  };
}

export function outcomeText(outcome, sides) {
  if (!outcome) return "";
  if (!outcome.winner) return "Draw — the wastes keep the scrap.";
  const name = sides.find((s) => s.id === outcome.winner)?.name || outcome.winner;
  const why = outcome.reason === "annihilation" ? "by annihilation" : "on salvage";
  return `${name} wins ${why}.`;
}
