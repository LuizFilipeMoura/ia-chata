// Pure, DOM-free view-model derived from room state. Shared so it can be unit
// tested in node and imported by the browser (via the /shared static mount).
import { ACTIONS } from "./rules.js";
import { EQUIPMENT } from "./game-state.js";
import { UNIT_KINDS, kindOf, partsByRole } from "./unit-kinds.js";

const ACTION_ORDER = ["move", "sprint", "disengage", "fire", "aimed", "reload", "repair", "douse", "prepare", "shutdown"];

// The action console list for the active rig: each action with its heat cost and
// whether the current budget/state allows it.
export function availableActions(rig, turn, round) {
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
      if ((key === "move" || key === "sprint") && rig.engagedWith != null) {
        enabled = false;
        note = "Engaged — Disengage first";
      }
      if ((key === "move" || key === "sprint") && rig.emplaced) {
        enabled = false;
        note = "Emplaced — Un-plant first";
      }
      if (key === "disengage") {
        enabled = left > 0 && rig.engagedWith != null && !rig.noDisengageNextActivation;
        if (rig.engagedWith == null) note = "Not engaged";
        else if (rig.noDisengageNextActivation) note = "Anchored — can't Disengage this activation";
      }
      if (key === "douse") {
        enabled = left > 0 && (rig.burning || 0) > 0;
        if ((rig.burning || 0) <= 0) note = "Not burning";
      }
      if ((key === "fire" || key === "aimed") && rig.engagedWith != null && !rangedSpent) {
        note = note ? `${note} · Engaged −2 Aim` : "Engaged — ranged −2 Aim";
      }
      // Barrage (§13, Mortar) — while barraging, the Mortar is locked out of a
      // direct shot; note it on Fire/Aimed (melee weapons are still fair game).
      if ((key === "fire" || key === "aimed") && rig.weapons?.longRange === "Mortar" && (rig.barrageRoundsLeft || 0) > 0) {
        const msg = "Mortar committed to Barrage — melee only";
        note = note ? `${note} · ${msg}` : msg;
      }
      return { key, label: def.label, heat, enabled, cost, note };
    });
  if (cfg.hasEquipment && rig.equipment && EQUIPMENT[rig.equipment]) {
    const active = EQUIPMENT[rig.equipment].active;
    const jjLocked = active.key === "jumpjets" && rig.engagedWith != null;
    list.push({
      key: active.key, label: active.label, heat: active.heat,
      enabled: left > 0 && !jjLocked, cost: 1,
      note: jjLocked ? "Engaged — Disengage first" : "",
    });
  }
  // Emplacement (§13, Bulwark Shield) — plant / un-plant the fortress stance.
  // Only surfaced for a rig carrying the upgrade (or already rooted).
  const hasEmplace = rig.weaponUpgrades?.melee === "emplacement";
  if (hasEmplace && !rig.emplaced) {
    const onCooldown = round != null && round < (rig.emplaceCooldownUntil || 0);
    list.push({
      key: "emplace", label: ACTIONS.emplace.label, heat: ACTIONS.emplace.heat,
      enabled: left > 0 && !onCooldown, cost: ACTIONS.emplace.slot,
      note: onCooldown ? `On cooldown until round ${rig.emplaceCooldownUntil}` : "",
    });
  }
  if (rig.emplaced) {
    list.push({
      key: "unplant", label: ACTIONS.unplant.label, heat: 2,
      enabled: left > 0, cost: ACTIONS.unplant.slot, note: "+2 heat",
    });
  }
  // Barrage (§13, Mortar) — surfaced only for a Mortar carrying the barrage
  // upgrade. Enabled with budget left and no barrage already running; while a
  // barrage is active it's disabled and the tube is locked out of direct fire.
  const hasBarrage = rig.weapons?.longRange === "Mortar" && rig.weaponUpgrades?.longRange === "barrage";
  if (hasBarrage) {
    const active = (rig.barrageRoundsLeft || 0) > 0;
    list.push({
      key: "barrage", label: ACTIONS.barrage.label, heat: ACTIONS.barrage.heat,
      enabled: left > 0 && !active, cost: ACTIONS.barrage.slot,
      note: active ? `Barrage active — ${rig.barrageRoundsLeft} round(s) left` : "",
    });
  }
  // Fire Control Lock (§13, Missile Barrage) — paint a target for one auto-hit
  // Armour-Piercing volley. Surfaced only for a Missile Barrage carrying it.
  const hasFireControl = rig.weapons?.longRange === "Missile Barrage" && rig.weaponUpgrades?.longRange === "fire-control-lock";
  if (hasFireControl) {
    list.push({
      key: "lock", label: ACTIONS.lock.label, heat: ACTIONS.lock.heat,
      enabled: left > 0, cost: ACTIONS.lock.slot,
      note: rig.lockedTarget != null ? "A lock is already primed" : "",
    });
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
  else if (rig.suppressImmobile) mods.push({ key: "suppress-immobile", tag: "Pinned", tone: "crit" });
  if (rig.emplaced) mods.push({ key: "emplaced", tag: "Emplaced", tone: "prep" });
  if ((rig.barrageRoundsLeft || 0) > 0) mods.push({ key: "barrage", tag: `Barrage ${rig.barrageRoundsLeft}`, tone: "warn" });
  if (rig.engagedWith != null) mods.push({ key: "engaged", tag: "Engaged", tone: "warn" });
  if ((rig.burning || 0) > 0) mods.push({ key: "burning", tag: `Burning ${rig.burning}`, tone: "crit" });
  if (rig.noCool) mods.push({ key: "nocool", tag: "No cooling", tone: "crit" });
  if (rig.speedHalvedNextRound) mods.push({ key: "speed", tag: "Speed halved", tone: "warn" });
  if (rig.skipNextActivation) mods.push({ key: "skip", tag: "Skips next activation", tone: "warn" });
  // Prototype-upgrade states so the player can track them at a glance.
  if ((rig.momentum || 0) > 0) mods.push({ key: "momentum", tag: `Momentum ${rig.momentum}`, tone: "prep" });
  if (rig.lockedTarget != null) mods.push({ key: "locked", tag: "Missiles locked", tone: "prep" });
  if ((rig.actionPenaltyNextActivation || 0) > 0) mods.push({ key: "actionpen", tag: `−${rig.actionPenaltyNextActivation} action next`, tone: "warn" });
  if (rig.noPrepNextActivation) mods.push({ key: "noprep", tag: "No Prepare next", tone: "warn" });
  if (rig.noDisengageNextActivation) mods.push({ key: "nodisengage", tag: "Anchored — no Disengage next", tone: "warn" });
  if (rig.noActivesNextActivation) mods.push({ key: "noactive", tag: "No actives next", tone: "warn" });
  if (rig.arcLockedNext) mods.push({ key: "arclock", tag: "Arc Gun locked", tone: "warn" });
  if (rig.armsSuppressed) mods.push({ key: "armssup", tag: "Arms suppressed · ½ ROF", tone: "warn" });
  if (rig.autocannonSlowNext) mods.push({ key: "beltcycle", tag: "Belt cycling · ½ ROF", tone: "warn" });
  for (const loc of Object.keys(rig.cracked || {})) mods.push({ key: `crack-${loc}`, tag: `Cracked: ${cap(loc)}`, tone: "warn" });
  for (const loc of Object.keys(rig.noRepair || {})) mods.push({ key: `norepair-${loc}`, tag: `No repair: ${cap(loc)}`, tone: "crit" });
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
