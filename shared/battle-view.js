// Pure, DOM-free view-model derived from room state. Shared so it can be unit
// tested in node and imported by the browser (via the /shared static mount).
import { ACTIONS } from "./rules.js";
import { EQUIPMENT, rigEffects } from "./game-state.js";
import { UNIT_KINDS, kindOf, partsByRole } from "./unit-kinds.js";

const ACTION_ORDER = ["move", "sprint", "disengage", "fire", "aimed", "repair", "douse", "prepare", "shutdown"];

// The action console list for the active rig: each action with its heat cost and
// whether the current budget/state allows it.
export function availableActions(rig, turn, round) {
  const cfg = UNIT_KINDS[kindOf(rig)];
  const eff = rigEffects(rig);
  const left = turn.actionsMax - turn.actionsUsed;
  // Spent is detected on whichever ranged slot the kind uses: a Rig clears
  // loaded.longRange when it fires (combat.js), a flat-pick cold kind clears
  // loaded.unit. Each kind only ever writes its own flag, so this OR is exact.
  // Reload is a drawer-only path now, so a spent-but-reloadable weapon keeps
  // Fire live (Fire opens that drawer); only Aimed is shut off while spent.
  const rangedSpent = rig.loaded?.longRange === false || rig.loaded?.unit === false;
  const firedRanged = (turn.longRangeShots || 0) >= 1;
  // A melee weapon can be aimed even after the ranged weapon is spent. It counts
  // as "live" only if the rig actually has a melee slot that isn't destroyed.
  const meleeName = rig.weapons?.melee;
  const meleeLive = !!meleeName && !(rig.weaponsDestroyed || []).includes(meleeName);
  const list = ACTION_ORDER
    .filter((key) => {
      if (key === "shutdown" && !cfg.hasHeat) return false;
      // Sprint burns heat to double-move; heatless cold kinds (Tank, Walker)
      // can't redline, so they only Move.
      if (key === "sprint" && !cfg.hasHeat) return false;
      if (key === "prepare" && !cfg.reactions) return false;
      return true;
    })
    .map((key) => {
      const def = ACTIONS[key];
      let enabled = left > 0;
      let cost = def.slot;
      let heat = eff.actionHeat[key] ?? def.heat;
      let note = "";
      if (key === "shutdown") enabled = true; // available any time; cools proportional to slots used
      // Hints only carry HIDDEN costs on an action you can still take, and only
      // when that cost isn't already shown by the heat chip or a status tag (see
      // `battleModifiers` below). Every "why this tile is greyed" or persistent-
      // state note is dropped: the disabled tile and the status tags say it.
      if (key === "fire" || key === "aimed") {
        if (rangedSpent) {
          // Ranged is spent. Fire still opens the drawer (Reload + a melee strike
          // if one is live). Aimed stays live only while a melee weapon can aim.
          if (key === "aimed" && !meleeLive) enabled = false;
        } else if (firedRanged) {
          heat = def.heat + 1;
          note = "Second shot — +1 heat"; // surcharge rule, not obvious from the total
        }
      }
      if ((key === "move" || key === "sprint") && (rig.engagedWith != null || rig.emplaced)) {
        enabled = false;
      }
      if (key === "disengage") {
        enabled = left > 0 && rig.engagedWith != null && !rig.noDisengageNextActivation;
      }
      if (key === "douse") {
        enabled = left > 0 && (rig.burning || 0) > 0;
      }
      if ((key === "fire" || key === "aimed") && rig.engagedWith != null && !rangedSpent) {
        note = note ? `${note} · Engaged −2 Aim` : "Engaged — ranged −2 Aim"; // penalty shown nowhere else
      }
      // Barrage lockout (§13, Mortar) carries no note: the "Barrage N" status tag
      // already signals the tube is committed and firing falls back to melee.
      return { key, label: def.label, heat, enabled, cost, note };
    });
  if (cfg.hasEquipment && rig.equipment && EQUIPMENT[rig.equipment]) {
    const active = EQUIPMENT[rig.equipment].active;
    const jjLocked = active.key === "jumpjets" && rig.engagedWith != null;
    list.push({
      key: active.key, label: active.label, heat: eff.actionHeat[active.key] ?? active.heat,
      enabled: left > 0 && !jjLocked, cost: 1, note: "", // jj lockout shown by "Engaged" tag
    });
  }
  // Emplacement (§13, Bulwark Shield) — plant / un-plant the fortress stance.
  // Only surfaced for a rig carrying the upgrade (or already rooted).
  const hasEmplace = rig.weaponUpgrades?.melee === "emplacement";
  if (hasEmplace && !rig.emplaced) {
    const onCooldown = round != null && round < (rig.emplaceCooldownUntil || 0);
    list.push({
      key: "emplace", label: ACTIONS.emplace.label, heat: ACTIONS.emplace.heat,
      enabled: left > 0 && !onCooldown, cost: ACTIONS.emplace.slot, note: "",
    });
  }
  if (rig.emplaced) {
    list.push({
      key: "unplant", label: ACTIONS.unplant.label, heat: 2,
      enabled: left > 0, cost: ACTIONS.unplant.slot, note: "", // heat chip shows +2
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
      enabled: left > 0 && !active, cost: ACTIONS.barrage.slot, note: "", // "Barrage N" tag shows it's running
    });
  }
  // Fire Control Lock (§13, Missile Barrage) — paint a target for one auto-hit
  // Armour-Piercing volley. Surfaced only for a Missile Barrage carrying it.
  const hasFireControl = rig.weapons?.longRange === "Missile Barrage" && rig.weaponUpgrades?.longRange === "fire-control-lock";
  if (hasFireControl) {
    list.push({
      key: "lock", label: ACTIONS.lock.label, heat: ACTIONS.lock.heat,
      enabled: left > 0, cost: ACTIONS.lock.slot, note: "", // "Missiles locked" tag shows a lock is primed
    });
  }
  // Support-unit module actions (spec: Support Units) — surfaced per module held.
  const modules = rig.modules || [];
  if (modules.includes("repair")) {
    list.push({ key: "fieldweld", label: ACTIONS.fieldweld.label, heat: ACTIONS.fieldweld.heat,
      enabled: left > 0, cost: ACTIONS.fieldweld.slot, note: "" });
  }
  if (modules.includes("coolant")) {
    list.push({ key: "vent", label: ACTIONS.vent.label, heat: ACTIONS.vent.heat,
      enabled: left > 0, cost: ACTIONS.vent.slot, note: "" });
  }
  if (modules.includes("recon")) {
    list.push({ key: "paint", label: ACTIONS.paint.label, heat: ACTIONS.paint.heat,
      enabled: left > 0, cost: ACTIONS.paint.slot, note: "" });
  }
  // Servo Actuators drops Sprint's heat to 1 — Move's own cost. Same heat for
  // 1½× the distance (2× with Reinforced Servos) makes Move strictly dominated,
  // so hide it — the Move group tile then fires Sprint directly.
  const sprintAct = list.find((a) => a.key === "sprint");
  if (sprintAct && sprintAct.heat <= ACTIONS.move.heat) {
    const i = list.findIndex((a) => a.key === "move");
    if (i >= 0) list.splice(i, 1);
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
    mods.push({ key: `${structPart}0`, tag: `${cap(structPart)} 0 · −2 actions −1 Aim`, tone: "crit", gloss: structPart });
  if (cfg.hasHeat && powerPart && rig[powerPart].sp === 0 && !rig[powerPart].destroyed)
    mods.push({ key: `${powerPart}0`, tag: `${cap(powerPart)} 0 · heat ≥3`, tone: "crit", gloss: powerPart });
  if (mobPart && rig[mobPart].sp === 0 && !rig.immobilised)
    mods.push({ key: `${mobPart}0`, tag: `${cap(mobPart)} 0 · −3\" move`, tone: "warn", gloss: mobPart });
  if (rig.immobilised) mods.push({ key: "immobile", tag: "Immobilised", tone: "crit", gloss: "immobilised" });
  else if (rig.suppressImmobile) mods.push({ key: "suppress-immobile", tag: "Pinned", tone: "crit", gloss: "pinned" });
  if (rig.emplaced) mods.push({ key: "emplaced", tag: "Emplaced", tone: "prep", gloss: "emplaced" });
  if ((rig.barrageRoundsLeft || 0) > 0) mods.push({ key: "barrage", tag: `Barrage ${rig.barrageRoundsLeft}`, tone: "warn", gloss: "barrage" });
  if (rig.engagedWith != null) mods.push({ key: "engaged", tag: "Engaged", tone: "warn", gloss: "engaged" });
  if ((rig.burning || 0) > 0) mods.push({ key: "burning", tag: `Burning ${rig.burning}`, tone: "crit", gloss: "burning" });
  if (rig.noCool) mods.push({ key: "nocool", tag: "No cooling", tone: "crit", gloss: "no-cooling" });
  if (rig.speedHalvedNextRound) mods.push({ key: "speed", tag: "Speed halved", tone: "warn", gloss: "speed-halved" });
  if (rig.skipNextActivation) mods.push({ key: "skip", tag: "Skips next activation", tone: "warn", gloss: "skip-activation" });
  // Prototype-upgrade states so the player can track them at a glance.
  if ((rig.momentum || 0) > 0) mods.push({ key: "momentum", tag: `Momentum ${rig.momentum}`, tone: "prep", gloss: "momentum" });
  if (rig.lockedTarget != null) mods.push({ key: "locked", tag: "Missiles locked", tone: "prep", gloss: "missiles-locked" });
  if ((rig.actionPenaltyNextActivation || 0) > 0) mods.push({ key: "actionpen", tag: `−${rig.actionPenaltyNextActivation} action next`, tone: "warn", gloss: "action-penalty" });
  if (rig.noPrepNextActivation) mods.push({ key: "noprep", tag: "No Prepare next", tone: "warn", gloss: "no-prepare" });
  if (rig.noDisengageNextActivation) mods.push({ key: "nodisengage", tag: "Anchored — no Disengage next", tone: "warn", gloss: "anchored" });
  if (rig.anchoredBy != null) mods.push({ key: "anchored", tag: "Anchored — Disengage costs a hit", tone: "warn", gloss: "anchored" });
  if (rig.noActivesNextActivation) mods.push({ key: "noactive", tag: "No actives next", tone: "warn", gloss: "no-actives" });
  if (rig.arcLockedNext) mods.push({ key: "arclock", tag: "Arc Gun locked", tone: "warn", gloss: "arc-locked" });
  if (rig.armsSuppressed) mods.push({ key: "armssup", tag: "Arms suppressed · ½ ROF", tone: "warn", gloss: "arms-suppressed" });
  if (rig.autocannonSlowNext) mods.push({ key: "beltcycle", tag: "Belt cycling · ½ ROF", tone: "warn", gloss: "belt-cycling" });
  for (const loc of Object.keys(rig.cracked || {})) mods.push({ key: `crack-${loc}`, tag: `Cracked: ${cap(loc)}`, tone: "warn", gloss: "cracked" });
  for (const loc of Object.keys(rig.rivetSeized || {})) mods.push({ key: `rivet-${loc}`, tag: `Riveted: ${cap(loc)}`, tone: "crit", gloss: "riveted" });
  for (const loc of Object.keys(rig.noRepair || {})) mods.push({ key: `norepair-${loc}`, tag: `No repair: ${cap(loc)}`, tone: "crit", gloss: "no-repair" });
  if (cfg.reactions && rig.preparation) {
    const p = rig.preparation;
    const hidden = p.hidden || p.faceUp === false;
    const tag = hidden ? "Reaction set" : prepLabel(p.type);
    const gloss = hidden ? "reaction-set" : (
      p.type === "evasive" ? "evasive" :
      p.type === "return" ? "return-fire" :
      p.type === "riposte" ? "riposte" :
      p.type === "sidestep" ? "sidestep" :
      p.type === "exploit" ? "exploit" : "braced");
    mods.push({ key: "prep", tag, tone: "prep", gloss });
  }
  for (const w of rig.weaponsDestroyed || []) mods.push({ key: "weapon", tag: `Weapon lost: ${w}`, tone: "warn", gloss: "weapon-lost" });
  if (rig.loaded && rig.loaded.longRange === false) mods.push({ key: "unloaded", tag: "Ranged unloaded", tone: "warn", gloss: "ranged-unloaded" });
  // Recon Paint mark (spec: Support Units) — visible so a marked enemy reads
  // at a glance (allied ranged attacks ignore its cover + gain +1 Aim).
  if (rig.painted) mods.push({ key: "painted", tag: "Painted", tone: "warn", gloss: "painted" });
  return mods;
}

function prepLabel(type) {
  if (type === "evasive") return "Evasive ready";
  if (type === "return") return "Return fire ready";
  if (type === "riposte") return "Riposte ready";
  if (type === "sidestep") return "Sidestep ready";
  if (type === "exploit") return "Exploit ready";
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
