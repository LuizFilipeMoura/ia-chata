// Pure, DOM-free view-model derived from room state. Shared so it can be unit
// tested in node and imported by the browser (via the /shared static mount).
import { ACTIONS } from "./rules.js";

const ACTION_ORDER = ["move", "sprint", "fire", "aimed", "ram", "reload", "repair", "prepare", "shutdown"];

// The action console list for the active rig: each action with its heat cost and
// whether the current budget/state allows it.
export function availableActions(rig, turn) {
  const left = turn.actionsMax - turn.actionsUsed;
  return ACTION_ORDER.map((key) => {
    const def = ACTIONS[key];
    let enabled = left > 0;
    if (key === "shutdown") enabled = turn.actionsUsed === 0; // declared before any action
    return { key, label: def.label, heat: def.heat, enabled };
  });
}

export function actionBudget(rig, turn) {
  return {
    used: turn.actionsUsed, max: turn.actionsMax,
    left: Math.max(0, turn.actionsMax - turn.actionsUsed),
    reduced: rig.hull.sp === 0,
  };
}

// Every active value-changing modifier, as { key, tag, tone } for chip rendering.
export function rigModifiers(rig) {
  const mods = [];
  if (rig.hull.sp === 0 && !rig.hull.destroyed) mods.push({ key: "hull0", tag: "Hull 0 · −2 actions −1 Aim", tone: "crit" });
  if (rig.engine.sp === 0 && !rig.engine.destroyed) mods.push({ key: "engine0", tag: "Engine 0 · heat ≥3", tone: "crit" });
  if (rig.legs.sp === 0 && !rig.immobilised) mods.push({ key: "legs0", tag: "Legs 0 · −3\" move", tone: "warn" });
  if (rig.immobilised) mods.push({ key: "immobile", tag: "Immobilised", tone: "crit" });
  if (rig.noCool) mods.push({ key: "nocool", tag: "No cooling", tone: "crit" });
  if (rig.speedHalvedNextRound) mods.push({ key: "speed", tag: "Speed halved", tone: "warn" });
  if (rig.skipNextActivation) mods.push({ key: "skip", tag: "Skips next activation", tone: "warn" });
  if (rig.preparation) mods.push({ key: "braced", tag: prepLabel(rig.preparation.type), tone: "prep" });
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
