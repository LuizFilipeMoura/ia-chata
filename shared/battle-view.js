// Pure, DOM-free view-model derived from room state. Shared so it can be unit
// tested in node and imported by the browser (via the /shared static mount).
import { ACTIONS, heatThreshold, equipmentUpgradeEffectOf } from "./rules.js";
import { EQUIPMENT, rigEffects, heatMeter, deriveAttackGeometry, integrityTier } from "./game-state.js";
import { UNIT_KINDS, kindOf, partsByRole } from "./unit-kinds.js";
import { radiusOf, terrainPolygons, clearOfTerrain } from "./geometry.js";

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
      let why = ""; // why a tile is greyed: kept off `note` (hints are for live tiles only)
      if (key === "shutdown") {
        enabled = true; // available any time; cools proportional to slots used
        // Meltdown Protocol downside: the core stays hot while a charge is banked.
        if ((rig.equipState?.meltdownCharge || 0) > 0) { enabled = false; why = "Can't Shut Down while a meltdown charge is banked"; }
      }
      // Hints only carry HIDDEN costs on an action you can still take, and only
      // when that cost isn't already shown by the heat chip or a status tag (see
      // `battleModifiers` below). Every "why this tile is greyed" or persistent-
      // state note is dropped: the disabled tile and the status tags say it.
      if (key === "fire" || key === "aimed") {
        if (rangedSpent) {
          // Ranged is spent. Fire still opens the drawer (which offers Reload,
          // plus a melee strike if one is live); Aimed is ranged-only, so shut it.
          if (key === "aimed") enabled = false;
        } else if (firedRanged) {
          heat = def.heat + 1;
          note = "Second shot, +1 heat"; // surcharge rule, not obvious from the total
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
        note = note ? `${note} · Engaged −2 Aim` : "Engaged, ranged −2 Aim"; // penalty shown nowhere else
      }
      // Barrage lockout (§13, Mortar) carries no note: the "Barrage N" status tag
      // already signals the tube is committed and firing falls back to melee.
      return why ? { key, label: def.label, heat, enabled, cost, note, why } : { key, label: def.label, heat, enabled, cost, note };
    });
  if (cfg.hasEquipment && rig.equipment && EQUIPMENT[rig.equipment]) {
    const active = EQUIPMENT[rig.equipment].active;
    const up = equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade);
    const s = rig.equipState || {};
    const offline = !!rig.noActivesNextActivation; // EMP (Ion Storm), "No actives next" tag says why
    let enabled = left > 0 && !offline;
    let label = active.label;
    let why = ""; // why the tile is greyed (not a `note`: hints are for live tiles only)
    let grapnel = false;
    if (active.key === "jumpjets") {
      // Movement: grounded while emplaced or pinned (tags say why).
      if (rig.emplaced || rig.suppressImmobile) enabled = false;
      if (up.grapnelLauncher) {
        // Grapnel Launcher replaces Jump Jets: it works while engaged (it yanks
        // the rig free), but recharges for 3 rounds after each shot.
        grapnel = true;
        label = "Grapnel";
        const cd = s.grapnelCooldown || 0;
        if (cd > 0) { enabled = false; why = `Grapnel recharging, ${cd} round${cd > 1 ? "s" : ""} left`; }
      } else if (rig.engagedWith != null) {
        enabled = false; // jj lockout shown by "Engaged" tag
      }
    }
    // Meltdown Protocol downside: no venting heat while a charge is banked.
    if ((active.key === "purge" || active.key === "heatpurgewave") && (s.meltdownCharge || 0) > 0) {
      enabled = false; why = "Can't vent while a meltdown charge is banked";
    }
    const entry = { key: active.key, label, heat: eff.actionHeat[active.key] ?? active.heat, enabled, cost: 1, note: "" };
    if (why) entry.why = why;
    if (grapnel) entry.grapnel = true;
    list.push(entry);
  }
  // Emplacement (§13, Bulwark Shield), plant / un-plant the fortress stance.
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
  // Barrage (§13, Mortar), surfaced only for a Mortar carrying the barrage
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
  // Fire Control Lock (§13, Missile Barrage), paint a target for one auto-hit
  // Armour-Piercing volley. Surfaced only for a Missile Barrage carrying it.
  const hasFireControl = rig.weapons?.longRange === "Missile Barrage" && rig.weaponUpgrades?.longRange === "fire-control-lock";
  if (hasFireControl) {
    list.push({
      key: "lock", label: ACTIONS.lock.label, heat: ACTIONS.lock.heat,
      enabled: left > 0, cost: ACTIONS.lock.slot, note: "", // "Missiles locked" tag shows a lock is primed
    });
  }
  // Support-unit module actions (spec: Support Units), surfaced per module held.
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
  // Servo Actuators drops Sprint's heat to 1, Move's own cost. Same heat for
  // 1½× the distance (2× with Reinforced Servos) makes Move strictly dominated,
  // so hide it, the Move group tile then fires Sprint directly.
  const sprintAct = list.find((a) => a.key === "sprint");
  if (sprintAct && sprintAct.heat <= ACTIONS.move.heat) {
    const i = list.findIndex((a) => a.key === "move");
    if (i >= 0) list.splice(i, 1);
  }
  return list;
}

// Equipment Prototype spends and actives that ride outside availableActions
// (they need a chooser: N, mode, host + location), for clients that can drive
// them. Cryo / Meltdown are free activation-start spends (no slot); Nanite
// Swarm is a 1-slot, +1 heat active. Each only appears for a rig carrying the
// matching upgrade. `max` is how many units can be spent.
export function equipmentSpends(rig, turn) {
  const up = equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade);
  const s = rig.equipState || {};
  const left = (turn?.actionsMax ?? 0) - (turn?.actionsUsed ?? 0);
  const out = [];
  if (up.cryoReservoir) {
    const n = s.cryo || 0;
    out.push({ key: "cryo", label: "Cryo", heat: n ? -2 : 0, cost: 0, max: n, enabled: n > 0,
      note: "", why: n ? "" : "No cryo banked (banks 1 each Recovery the rig cools)" });
  }
  if (up.meltdownProtocol) {
    const n = s.meltdownCharge || 0;
    out.push({ key: "meltdown", label: "Meltdown", heat: 0, cost: 0, max: n, enabled: n > 0,
      note: "", why: n ? "" : "No meltdown charge (banks overheat instead of rolling)" });
  }
  if (up.naniteSwarm) {
    out.push({ key: "nanite", label: "Nanite Swarm", heat: 1, cost: 1, max: 1, enabled: left > 0, note: "" });
  }
  return out;
}

// Every piece of tracked equipment state, as compact chips:
// { key, icon, value, label, tip, tone, gloss }. `value` is the number to show
// beside the icon (null for a plain flag). rigModifiers folds these in as tags.
export function equipmentChips(rig) {
  const s = rig.equipState || {};
  const up = equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade);
  const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : "");
  const chips = [];
  const add = (key, icon, value, label, tip, tone, gloss) => chips.push({ key, icon, value, label, tip, tone, gloss });
  if (rig.hardened) add("hardened", "harden", null, "Hardened",
    `Harden: wound rolls against this rig are at −${up.hardenImpact || 1} Penetration until its next activation.`, "prep", "hardened");
  if (rig.smokeNextActivation) add("smoke", "smoke", null, "Smoked",
    `Pop Smoke: every attacker is at −2 accuracy against this rig until its next activation.${up.chaffBurst ? " Chaff Burst: it side-steps half Speed when fired on." : ""}`, "prep", "smoked");
  if (rig.overclocked) add("overclocked", "overclock", null, "Overclocked", "Overclock: extra actions this activation.", "prep", "overclocked");
  if (rig.reactorOverdriveActive) add("overdrive", "overclock", "+2", "Overdrive +2 Pen",
    "Reactor Overdrive: +2 Penetration on every attack this activation, but the overheat bonus is doubled.", "warn", "reactor-overdrive");
  if (rig.lockSightNext) add("locksight", "aimed", null, "Lock Sight",
    "Lock Sight: the next shot this activation rerolls all its missed to-hit dice.", "prep", "lock-sight");
  if ((s.nextAttackPen || 0) > 0) add("nextpen", "pen", `+${s.nextAttackPen}`, `+${s.nextAttackPen} Pen primed`,
    `Cryo / Meltdown spend: +${s.nextAttackPen} Penetration on this rig's attacks this activation.`, "prep", "primed-pen");
  if (up.cryoReservoir && (s.cryo || 0) > 0) add("cryo", "cryo", s.cryo, `Cryo ${s.cryo}/3`,
    "Cryo Reservoir: spend N banked cryo (free) for −2 heat each and +N Penetration on the next attack. While any is banked, Recovery cools only 1.", "prep", "cryo");
  if (up.meltdownProtocol && (s.meltdownCharge || 0) > 0) add("meltdown", "meltdown", s.meltdownCharge, `Meltdown ${s.meltdownCharge}/6`,
    "Meltdown Protocol: spend N (free) for +N Penetration, or a burst of N heat on every enemy within 4\". No venting or Shut Down while banked, and it detonates if the Engine hits 0.", "warn", "meltdown");
  for (const st of s.naniteStacks || []) add(`nanite-${st.loc}`, "nanite", st.sp, `Nanites: ${cap(st.loc)} ${st.sp}`,
    `Nanite Swarm: heals 1 SP on ${cap(st.loc)} each Recovery, then decays 1 (${st.sp} left). Heat Capacity −1 while any stack lives.`, "prep", "nanites");
  if (up.ablativeCascade) {
    const n = s.ablativeCharges || 0;
    add("ablative", "harden", n, `Ablative ${n}/2`,
      "Ablative Cascade: each charge negates one landed wound (+1 heat each). Refills to 2 each Recovery.", n ? "prep" : "warn", "ablative-charges");
  }
  if (up.pointDefense) {
    const n = s.interceptors || 0;
    if (s.pdLocked) add("pd", "intercept", 0, "Point-Defense offline",
      "Point-Defense System: offline this round because the rig fired its own ranged weapon last round.", "warn", "point-defense");
    else add("pd", "intercept", n, `Interceptors ${n}/2`,
      "Point-Defense System: each interceptor forces an incoming ranged attack to reroll its hits (+1 heat each). Refills to 2 each Recovery.", n ? "prep" : "warn", "point-defense");
  }
  if (up.fireSolutionLock && (s.solution?.count || 0) > 0) add("solution", "lock", s.solution.count, `Solution ${s.solution.count}/3`,
    "Fire Solution Lock: each Fire at the same target stacks the solution; at 3 the next shot is an auto-hit, armour-piercing volley. Switching target resets it.", "prep", "fire-solution");
  if (up.grapnelLauncher && (s.grapnelCooldown || 0) > 0) add("grapnel", "grapnel", s.grapnelCooldown, `Grapnel ${s.grapnelCooldown} rd`,
    `Grapnel Launcher recharging: ${s.grapnelCooldown} round${s.grapnelCooldown > 1 ? "s" : ""} until it can fire again.`, "warn", "grapnel");
  return chips;
}

// ---- Digital previews for spatial equipment (pure; the engine re-checks) ----

// A straight-line hop (Jump Jets, Grapnel yank) to `dest`: within `budget`
// centre to centre, wholly on the table, clear of terrain and of every other
// base. Returns { ok, dist, reason }.
export function hopLanding(state, rig, dest, budget) {
  const r = radiusOf(rig);
  const dist = Math.hypot(dest.x - rig.pos.x, dest.y - rig.pos.y);
  if (dist > budget + 1e-6) return { ok: false, dist, reason: "out of reach" };
  const f = state.field;
  if (f && (dest.x < r || dest.y < r || dest.x > f.width - r || dest.y > f.height - r)) return { ok: false, dist, reason: "off the table" };
  if (!clearOfTerrain(dest, r, terrainPolygons(f))) return { ok: false, dist, reason: "landing on terrain" };
  const hit = (state.rigs || []).find((o) => o.id !== rig.id && !o.destroyed && o.pos
    && Math.hypot(o.pos.x - dest.x, o.pos.y - dest.y) < r + radiusOf(o) - 1e-6);
  if (hit) return { ok: false, dist, reason: `landing on ${hit.name}` };
  return { ok: true, dist, reason: "" };
}

// Enemy rigs whose base rim is within `reach` inches of this rig's rim (Heat
// Purge Wave 3", Meltdown burst 4").
export function aoeVictims(rigs, rig, reach) {
  return (rigs || []).filter((o) => o.id !== rig.id && (o.owner || "a") !== (rig.owner || "a") && !o.destroyed && o.pos
    && Math.hypot(o.pos.x - rig.pos.x, o.pos.y - rig.pos.y) - radiusOf(o) - radiusOf(rig) <= reach + 1e-9);
}

// Grapnel reel: enemies within 8" (base rim to rim), in line of sight and in
// this rig's front arc.
export const GRAPNEL_REEL_RANGE = 8;
export const GRAPNEL_YANK_RANGE = 4;
export function reelTargets(state, rig) {
  return (state.rigs || []).filter((o) => (o.owner || "a") !== (rig.owner || "a") && !o.destroyed && o.pos).filter((o) => {
    const g = deriveAttackGeometry(state, rig, o);
    return g.los && g.inFrontArc && g.distance - radiusOf(o) - radiusOf(rig) <= GRAPNEL_REEL_RANGE + 1e-6;
  });
}

// Nanite Swarm hosts: self, plus every ally with `inReach` (rim within 3").
export const NANITE_REACH = 3;
export function naniteHosts(rigs, rig) {
  return (rigs || []).filter((o) => (o.owner || "a") === (rig.owner || "a") && !o.destroyed).map((o) => ({
    rig: o,
    self: o.id === rig.id,
    inReach: o.id === rig.id || (!!o.pos && !!rig.pos
      && Math.hypot(o.pos.x - rig.pos.x, o.pos.y - rig.pos.y) - radiusOf(o) - radiusOf(rig) <= NANITE_REACH + 1e-9),
  }));
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
  // Integrity (§8a) danger tier, first so it leads the chip row.
  const tier = integrityTier(rig);
  if (tier === "bloodied") mods.push({ key: "integrity", tag: `Bloodied · ${rig.integrity}/${rig.integrityMax}`, tone: "warn", gloss: "bloodied" });
  else if (tier === "critical") mods.push({ key: "integrity", tag: `Critical · ${rig.integrity}/${rig.integrityMax}`, tone: "crit", gloss: "critical" });
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
  if (rig.staggered) mods.push({ key: "staggered", tag: "Staggered · −1 Aim next attack", tone: "warn", gloss: "staggered" });
  if (rig.skipNextActivation) mods.push({ key: "skip", tag: "Skips next activation", tone: "warn", gloss: "skip-activation" });
  // Prototype-upgrade states so the player can track them at a glance.
  if ((rig.momentum || 0) > 0) mods.push({ key: "momentum", tag: `Momentum ${rig.momentum}`, tone: "prep", gloss: "momentum" });
  if (rig.lockedTarget != null) mods.push({ key: "locked", tag: "Missiles locked", tone: "prep", gloss: "missiles-locked" });
  if ((rig.actionPenaltyNextActivation || 0) > 0) mods.push({ key: "actionpen", tag: `−${rig.actionPenaltyNextActivation} action next`, tone: "warn", gloss: "action-penalty" });
  if (rig.noPrepNextActivation) mods.push({ key: "noprep", tag: "No Prepare next", tone: "warn", gloss: "no-prepare" });
  if (rig.noDisengageNextActivation) mods.push({ key: "nodisengage", tag: "Anchored, no Disengage next", tone: "warn", gloss: "anchored" });
  if (rig.anchoredBy != null) mods.push({ key: "anchored", tag: "Anchored, Disengage costs a hit", tone: "warn", gloss: "anchored" });
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
    // An Improved (Grit) prep: the owner always sees it named. The opponent's
    // copy of a face-down one is redacted to { hidden: true } by publicState, so
    // it never reaches this branch.
    const improved = p.improved && !p.hidden;
    const tag = improved ? `Improved ${prepShortName(p.type)}` : hidden ? "Reaction set" : prepLabel(p.type);
    const gloss = improved ? "improved-prep" : hidden ? "reaction-set" : (
      p.type === "evasive" ? "evasive" :
      p.type === "return" ? "return-fire" :
      p.type === "riposte" ? "riposte" :
      p.type === "sidestep" ? "sidestep" :
      p.type === "exploit" ? "exploit" : "braced");
    mods.push({ key: "prep", tag, tone: "prep", gloss });
  }
  for (const w of rig.weaponsDestroyed || []) mods.push({ key: "weapon", tag: `Weapon lost: ${w}`, tone: "warn", gloss: "weapon-lost" });
  if (rig.loaded && rig.loaded.longRange === false) mods.push({ key: "unloaded", tag: "Ranged unloaded", tone: "warn", gloss: "ranged-unloaded" });
  // Recon Paint mark (spec: Support Units), visible so a marked enemy reads
  // at a glance (allied ranged attacks ignore its cover + gain +1 Aim).
  if (rig.painted) mods.push({ key: "painted", tag: "Painted", tone: "warn", gloss: "painted" });
  // Equipment tracked state (charges, banks, stacks, cooldowns, one-shot flags).
  if (cfg.hasEquipment !== false) for (const c of equipmentChips(rig)) mods.push({ key: `eq-${c.key}`, tag: c.label, tone: c.tone, gloss: c.gloss });
  return mods;
}

function prepShortName(type) {
  if (type === "evasive") return "Evasive";
  if (type === "return") return "Return Fire";
  if (type === "raise-shield") return "Raise Shield";
  if (type === "riposte") return "Riposte";
  if (type === "sidestep") return "Sidestep";
  if (type === "exploit") return "Exploit";
  return "Brace";
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
    gritTokens: game.gritTokens || { a: 0, b: 0 },
  };
}

export function outcomeText(outcome, sides) {
  if (!outcome) return "";
  if (!outcome.winner) return "Draw, the wastes keep the scrap.";
  const name = sides.find((s) => s.id === outcome.winner)?.name || outcome.winner;
  const why = outcome.reason === "annihilation" ? "by annihilation" : "on salvage";
  return `${name} wins ${why}.`;
}

// What ending the activation at this heat would risk (§6): the Heat Threshold
// Table folded over the D12. `extraHeat` previews an action before you take it.
// Returns { over, bonus, pBad (any damage), pSevere (Buckling or worse), rows }.
export function overheatOdds(rig, extraHeat = 0) {
  const m = heatMeter({ ...rig, engine: { ...rig.engine, heat: (rig.engine?.heat || 0) + extraHeat } });
  if (!m.over) return { over: 0, bonus: 0, pBad: 0, pSevere: 0, rows: [] };
  const counts = new Map();
  for (let d = 1; d <= 12; d++) {
    const row = heatThreshold(d + m.bonus);
    counts.set(row.key, { key: row.key, label: row.label, n: (counts.get(row.key)?.n || 0) + 1 });
  }
  const rows = [...counts.values()].map((r) => ({ key: r.key, label: r.label, p: r.n / 12 }));
  const pOf = (keys) => rows.filter((r) => keys.includes(r.key)).reduce((a, r) => a + r.p, 0);
  return {
    over: m.over, bonus: m.bonus, rows,
    pBad: rows.filter((r) => r.key !== "safe").reduce((a, r) => a + r.p * 12, 0) / 12,
    pSevere: pOf(["buckling", "engine-failure", "catastrophic"]) * 12 / 12,
  };
}
