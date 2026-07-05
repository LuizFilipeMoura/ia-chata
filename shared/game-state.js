import { ACTIONS, heatThreshold } from "./rules.js";

export const RIG_DEFAULTS = {
  light:    { hull: 6, arms: 5, legs: 5, engine: 4 },
  medium:   { hull: 7, arms: 6, legs: 6, engine: 5 },
  heavy:    { hull: 8, arms: 7, legs: 7, engine: 6 },
  colossal: { hull: 9, arms: 8, legs: 8, engine: 7 },
};
export const LOCS = ["hull", "arms", "legs", "engine"];
// Heat Capacity by weight class (rules §6). A Rig is safe at or below this
// value; each point beyond it adds +2 (capped +10) to the misfire roll.
export const HEAT_CAPACITY = { light: 6, medium: 5, heavy: 4, colossal: 3 };
export const MAX_OVERHEAT_BONUS = 10;
export const SUPPORTED_RIG_CLASSES = ["light", "medium"];
export const MAX_RIGS_PER_SIDE = 3;
export const MAX_RIGS_TOTAL = 6;
export const WEAPONS = {
  longRange: {
    "Mini Gun":      { rof: 8, str: 4,  acc: [1, -1], rng: [9, 18],  perks: ["Full Auto", "Hot", "Raking Fire"] },
    "Double MG":     { rof: 8, str: 6,  acc: [1, 0],  rng: [9, 18],  perks: ["Full Auto", "Raking Fire"] },
    "Autocannon":    { rof: 4, str: 8,  acc: [0, -1], rng: [12, 24], perks: ["Full Auto"] },
    "Arc Gun":       { rof: 2, str: 10, acc: [0, 1],  rng: [15, 30], perks: ["Charged Shot", "Precision"] },
    "Mortar":        { rof: 3, str: 9,  acc: [-1, 0], rng: [15, 30], perks: ["Charged Shot", "Incendiary"] },
    "Sniper Cannon": { rof: 1, str: 12, acc: [0, -1], rng: [12, 24], perks: ["Precision"] },
  },
  melee: {
    "Sword":         { rof: 2, str: 6,  acc: [0, 0], rng: [1.5, 1.5], perks: ["Melee", "Shock"] },
    "Circular Saw":  { rof: 3, str: 6,  acc: [0, 0], rng: [1.5, 1.5], perks: ["Melee", "Cleave"] },
    "Chainsaw":      { rof: 3, str: 8,  acc: [0, 0], rng: [1.5, 1.5], perks: ["Melee", "Rend"] },
    "Claw":          { rof: 2, str: 8,  acc: [1, 1], rng: [1.5, 1.5], perks: ["Melee", "Armour Piercing"] },
    "Lance":         { rof: 1, str: 11, acc: [1, 1], rng: [1.5, 1.5], perks: ["Melee", "Impale"] },
    "Wrecking Ball": { rof: 1, str: 12, acc: [0, 0], rng: [1.5, 1.5], perks: ["Melee", "Staggering"] },
  },
};

export function createRoom(code) {
  return {
    code,
    version: 0,
    nextRigId: 1,
    game: {
      round: 1,
      sides: [
        { id: "a", name: "You",   vp: 0, claimed: false, ready: false },
        { id: "b", name: "Enemy", vp: 0, claimed: false, ready: false },
      ],
      objectives: [],
      started: false,
      bounties: {},
      autoResolve: true,
      phase: "setup",
      deployOrder: [],
      initiative: null,
      answerTokens: { a: 0, b: 0 },
      turn: null,
      resolutions: [],
      nextResolutionId: 1,
      recoveryVp: {},
      suddenDeath: false,
      outcome: null,
    },
    rigs: [],
  };
}

function ensureRigShape(rig) {
  if (typeof rig.activated !== "boolean") rig.activated = false;
  if (typeof rig.skipNextActivation !== "boolean") rig.skipNextActivation = false;
  if (typeof rig.noCool !== "boolean") rig.noCool = false;
  if (typeof rig.speedHalvedNextRound !== "boolean") rig.speedHalvedNextRound = false;
  if (!rig.loaded || typeof rig.loaded !== "object") rig.loaded = { longRange: true, melee: true };
  if (rig.preparation === undefined) rig.preparation = null;
  if (!Array.isArray(rig.weaponsDestroyed)) rig.weaponsDestroyed = [];
  if (typeof rig.immobilised !== "boolean") rig.immobilised = false;
  return rig;
}

function ensureGameShape(room) {
  room.game ||= {};
  room.game.round ||= 1;
  room.game.sides ||= [
    { id: "a", name: "You",   vp: 0, claimed: false },
    { id: "b", name: "Enemy", vp: 0, claimed: false },
  ];
  for (const side of room.game.sides) {
    if (typeof side.ready !== "boolean") side.ready = false;
  }
  room.game.objectives ||= [];
  if (typeof room.game.started !== "boolean") room.game.started = false;
  room.game.bounties ||= {};
  room.rigs ||= [];
  if (typeof room.game.autoResolve !== "boolean") room.game.autoResolve = true;
  room.game.phase ||= "setup";
  room.game.deployOrder ||= [];
  if (room.game.initiative === undefined) room.game.initiative = null;
  room.game.answerTokens ||= { a: 0, b: 0 };
  if (room.game.turn === undefined) room.game.turn = null;
  room.game.resolutions ||= [];
  room.game.nextResolutionId ||= 1;
  room.game.recoveryVp ||= {};
  if (typeof room.game.suddenDeath !== "boolean") room.game.suddenDeath = false;
  if (room.game.outcome === undefined) room.game.outcome = null;
  for (const rig of room.rigs) ensureRigShape(rig);
  return room;
}

export function normalizeWeapon(category, name) {
  const table = WEAPONS[category];
  if (!table || !name) return null;
  const ref = String(name).trim().toLowerCase();
  return Object.keys(table).find((weapon) => weapon.toLowerCase() === ref) || null;
}

export function makeRig(id, name, cls, owner, weapons = {}) {
  const normalizedClass = String(cls || "").trim().toLowerCase();
  if (!SUPPORTED_RIG_CLASSES.includes(normalizedClass)) return null;
  const longRange = normalizeWeapon("longRange", weapons.longRange || weapons.lr);
  const melee = normalizeWeapon("melee", weapons.melee);
  if (!longRange || !melee) return null;

  const weightClass = normalizedClass;
  const d = RIG_DEFAULTS[weightClass];
  return {
    id,
    name: String(name || "Rig").trim() || "Rig",
    weightClass,
    owner: owner === "b" ? "b" : "a",
    hull:   { sp: d.hull, max: d.hull, destroyed: false },
    arms:   { sp: d.arms, max: d.arms, destroyed: false },
    legs:   { sp: d.legs, max: d.legs, destroyed: false },
    engine: { sp: d.engine, max: d.engine, destroyed: false, heat: 0 },
    weapons: { longRange, melee },
    prepare: 0,    // Phase 4
    activated: false,
    skipNextActivation: false,
    noCool: false,
    speedHalvedNextRound: false,
    loaded: { longRange: true, melee: true },
    preparation: null,
    weaponsDestroyed: [],
    immobilised: false,
    destroyed: false,
  };
}

// Derive the full heat picture for a Rig's engine: current heat, its Heat
// Capacity (the redline), the floor heat can't drop below, and — when running
// hot — the misfire bonus that would be added to the D12 overheat roll right
// now. `zone` is a coarse severity band for UI colouring.
export function heatMeter(rig) {
  const heat = rig?.engine?.heat || 0;
  const cap = HEAT_CAPACITY[rig?.weightClass] ?? 5;
  const floor = rig?.engine?.sp === 0 ? 3 : 0;
  const over = Math.max(0, heat - cap);
  const bonus = over > 0 ? Math.min(MAX_OVERHEAT_BONUS, 2 * over) : 0;
  let zone;
  if (over > 0) zone = "over";
  else if (heat >= cap) zone = "redline";
  else if (heat > cap * 0.6) zone = "warm";
  else if (heat > 0) zone = "cool";
  else zone = "cold";
  return { heat, cap, floor, over, bonus, zone };
}

export function findRig(room, name) {
  ensureGameShape(room);
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  return room.rigs.find((r) => r.name.toLowerCase() === n) || null;
}

export function normalizeSide(room, ref) {
  ensureGameShape(room);
  if (!ref) return null;
  const s = String(ref).trim().toLowerCase();
  const byId = room.game.sides.find((x) => x.id === s);
  if (byId) return byId.id;
  const byName = room.game.sides.find((x) => x.name.toLowerCase() === s);
  return byName ? byName.id : null;
}

export function claimSide(room, { name, side } = {}) {
  ensureGameShape(room);
  // An explicitly requested side is always granted — this makes auto-rejoin
  // idempotent (a returning player reclaims their own side) and lets players
  // deliberately pick a side. Only auto-assign the first free side when none
  // was requested; return null only if the room is genuinely full.
  let target = side ? room.game.sides.find((s) => s.id === side) : null;
  if (!target) target = room.game.sides.find((s) => !s.claimed);
  if (!target) return null;
  const newName = name ? (String(name).trim() || target.name) : target.name;
  const changed = !target.claimed || target.name !== newName;
  target.claimed = true;
  target.name = newName;
  if (changed) room.version++;
  return target.id;
}

function sideRigCount(room, sideId) {
  return room.rigs.filter((rig) => (rig.owner || "a") === sideId).length;
}

export function canAddRigForSide(room, sideId) {
  const rigs = Array.isArray(room?.rigs) ? room.rigs : [];
  const owner = sideId === "b" ? "b" : "a";
  return rigs.length < MAX_RIGS_TOTAL &&
    rigs.filter((rig) => (rig.owner || "a") === owner).length < MAX_RIGS_PER_SIDE;
}

function resetReadyBeforeStart(room) {
  if (room.game.started) return;
  for (const side of room.game.sides) side.ready = false;
  room.game.bounties = {};
  room.game.deployOrder = [];
}

// Roll an N-sided die. A valid caller-supplied value (manual dice entry) is used
// as-is; otherwise roll with the injectable random (auto mode / tests).
function rollD(sides, provided, random = Math.random) {
  if (provided != null) {
    const v = Math.floor(Number(provided));
    if (Number.isFinite(v) && v >= 1 && v <= sides) return v;
  }
  return Math.floor((random || Math.random)() * sides) + 1;
}

// Append a dice/effect entry to the capped shared log the client animates.
function pushResolution(room, entry) {
  entry.id = room.game.nextResolutionId++;
  room.game.resolutions.push(entry);
  while (room.game.resolutions.length > 12) room.game.resolutions.shift();
}

// Round-1 initiative comes from deployment, not dice: the first side to Ready
// (deployOrder[0]) is the first-deployer and therefore activates SECOND (§10.5).
function deploymentOrder(room) {
  const second = room.game.deployOrder[0] || "a";
  const first = second === "a" ? "b" : "a";
  return [first, second];
}

// Record an initiative result: set activation order, grant the second activator
// 2 Answer tokens, open the turn, and enter the activation phase.
function applyInitiative(room, order, rolls) {
  const [first, second] = order;
  room.game.initiative = { rolls: rolls || null, order: [first, second], second };
  room.game.answerTokens = { a: 0, b: 0 };
  room.game.answerTokens[second] = 2;
  room.game.turn = { side: first, activeRigId: null, actionsUsed: 0, actionsMax: 0 };
  room.game.phase = "activation";
}

function randomPick(items, random = Math.random) {
  if (!items.length) return null;
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index];
}

function maybeStartGame(room, random = Math.random) {
  if (room.game.started) return false;
  const canStart = room.game.sides.every((side) => side.ready && sideRigCount(room, side.id) >= 3);
  if (!canStart) return false;

  const bounties = {};
  for (const side of room.game.sides) {
    const target = randomPick(room.rigs.filter((rig) => (rig.owner || "a") !== side.id), random);
    if (!target) return false;
    bounties[side.id] = target.id;
  }
  room.game.bounties = bounties;
  room.game.started = true;
  room.game.phase = "initiative";
  room.game.round = 1;
  applyInitiative(room, deploymentOrder(room), null);
  pushResolution(room, {
    kind: "initiative", actor: room.game.turn.side, rigId: null, rolls: [],
    summary: `Round 1 — ${room.game.initiative.order[0]} activates first`, effects: [],
  });
  return true;
}

function engineHeatFloor(rig) {
  return rig.engine.sp === 0 ? 3 : 0;
}

function recompute(rig) {
  rig.destroyed = rig.hull.destroyed || rig.engine.destroyed ||
    LOCS.every((l) => rig[l].sp === 0);
  const floor = engineHeatFloor(rig);
  if (rig.engine.heat < floor) rig.engine.heat = floor;
}

function damageRig(rig, loc, amount) {
  const c = rig[loc];
  if (!c) return;
  let n = Math.max(0, Math.floor(Number(amount) || 0));
  while (n-- > 0) {
    if (c.sp > 0) c.sp -= 1;
    else c.destroyed = true;
  }
  if (loc === "engine" && c.sp === 0) { c.heat = Math.max(c.heat, 3); rig.skipNextActivation = true; }
  recompute(rig);
}

// §8 — effect when a component first reaches 0 SP. May recurse via applyDamage.
function catastrophicOnZero(room, rig, loc, opts) {
  if (loc === "engine") { rig.skipNextActivation = true; rig.engine.heat = Math.max(rig.engine.heat, 3); }
  else if (loc === "arms") {
    const roll = rollD(12, opts?.dice?.armsWeapon, opts?.random);
    const slot = roll <= 6 ? "longRange" : "melee";
    const name = rig.weapons?.[slot];
    if (name && !rig.weaponsDestroyed.includes(name)) rig.weaponsDestroyed.push(name);
    applyDamage(room, rig, "hull", 1, opts);
    applyDamage(room, rig, "engine", 1, opts);
  }
  // Legs at 0 (move penalties) and Hull at 0 (−2 actions / −1 Aim) are enforced
  // where they apply (activation budget, combat modAim) — no state to set here.
}

// §8 — additional damage to an already 0-SP location.
function catastrophicAdditional(room, rig, loc, opts) {
  if (loc === "hull" || loc === "engine") rig[loc].destroyed = true;
  else if (loc === "legs") rig.immobilised = true;
  else if (loc === "arms") applyDamage(room, rig, "hull", 3, opts);
}

// Cascade-aware damage entry point. Applies `amount` SP one point at a time,
// firing §8 clauses, then recomputes destruction (§9 handled in onRigDamaged).
function applyDamage(room, rig, loc, amount, opts) {
  const c = rig[loc];
  if (!c) return;
  let n = Math.max(0, Math.floor(Number(amount) || 0));
  while (n-- > 0) {
    if (c.sp > 0) {
      c.sp -= 1;
      if (c.sp === 0) { recompute(rig); catastrophicOnZero(room, rig, loc, opts); }
    } else {
      catastrophicAdditional(room, rig, loc, opts);
    }
  }
  recompute(rig);
  onRigDamaged(room, rig, opts);
}

// Replaced with §9 destruction in Task 5.
function onRigDamaged(room, rig, opts) { checkAnnihilation(room); }

function repairRig(rig, loc, amount) {
  const c = rig[loc];
  if (!c) return;
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  c.sp = Math.min(c.max, c.sp + n);
  if (c.sp > 0) c.destroyed = false;
  recompute(rig);
}

function setRigSp(rig, loc, sp) {
  const c = rig[loc];
  if (!c) return;
  const v = Math.max(0, Math.min(c.max, Math.floor(Number(sp) || 0)));
  c.sp = v;
  if (v > 0) c.destroyed = false;
  recompute(rig);
  if (loc === "engine" && c.sp === 0) rig.skipNextActivation = true;
}

function heatRig(rig, spec) {
  const c = rig.engine;
  const s = String(spec).trim();
  let v;
  if (/^[+-]/.test(s)) v = c.heat + Number(s);
  else v = Number(s);
  if (!Number.isFinite(v)) return;
  c.heat = Math.max(engineHeatFloor(rig), Math.floor(v));
}

function sideHasActivatable(room, sideId) {
  return room.rigs.some((r) => (r.owner || "a") === sideId && !r.destroyed && !r.activated);
}

// After a rig finishes, pass to the other side if it can still act; otherwise
// the same side continues back-to-back; if neither can act, run Recovery (§4).
function handoff(room) {
  if (room.game.outcome) return;
  const cur = room.game.turn.side;
  const other = cur === "a" ? "b" : "a";
  if (sideHasActivatable(room, other)) room.game.turn.side = other;
  else if (sideHasActivatable(room, cur)) room.game.turn.side = cur;
  else runRecovery(room);
}

function runRecovery(room) {
  for (const rig of room.rigs) {
    if (!rig.noCool) {
      const floor = engineHeatFloor(rig);
      rig.engine.heat = Math.max(floor, rig.engine.heat - 2);
    }
    rig.activated = false;
    rig.speedHalvedNextRound = false;
    rig.preparation = null;
    recompute(rig);
  }
  room.game.answerTokens = { a: 0, b: 0 };
  room.game.turn = null;
  room.game.phase = "recovery";
  room.game.recoveryVp = {};
}

function bumpHeat(rig, n) {
  rig.engine.heat = Math.max(engineHeatFloor(rig), rig.engine.heat + n);
  recompute(rig);
}

// End the acting rig's activation: run the overheat check (§6), mark it done,
// close the turn, then hand off (which may trigger Recovery).
function endActivation(room, rig, dice, random) {
  const m = heatMeter(rig);
  if (m.over > 0) {
    const roll = rollD(12, dice?.overheat, random);
    const total = roll + m.bonus;
    const row = applyOverheat(room, rig, total, { random });
    pushResolution(room, {
      kind: "overheat", actor: rig.owner, rigId: rig.id,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name}: ${row.label} (D12 ${roll}+${m.bonus}=${total})`,
      effects: [row.text],
    });
    checkAnnihilation(room);
  }
  rig.activated = true;
  room.game.turn.activeRigId = null;
  handoff(room);
}

// Apply one Heat Threshold Table row's effect to a rig (§6), routed through
// the §8 cascade-aware applyDamage. Returns the row.
function applyOverheat(room, rig, total, opts) {
  const row = heatThreshold(total);
  if (row.key === "stall") applyDamage(room, rig, "engine", 1, opts);
  else if (row.key === "detonation") applyDamage(room, rig, "arms", 2, opts);
  else if (row.key === "blowout") { applyDamage(room, rig, "legs", 2, opts); rig.speedHalvedNextRound = true; }
  else if (row.key === "buckling") for (const l of LOCS) applyDamage(room, rig, l, 1, opts);
  else if (row.key === "engine-failure") { applyDamage(room, rig, "engine", 2, opts); rig.noCool = true; }
  else if (row.key === "catastrophic") { for (const l of LOCS) setRigSp(rig, l, 0); rig.noCool = true; }
  return row;
}

// One action during an activation. Returns whether anything changed.
function performAction(room, rig, act, a, random) {
  const t = room.game.turn;
  if (act === "shutdown") {
    if (t.actionsUsed !== 0) return false;
    rig.engine.heat = engineHeatFloor(rig);
    recompute(rig);
    endActivation(room, rig, null, random);
    return true;
  }
  const def = ACTIONS[act];
  if (!def || t.actionsUsed >= t.actionsMax) return false;
  if (act === "reload") {
    rig.loaded = { longRange: true, melee: true };
  } else if (act === "repair") {
    const roll = rollD(12, a.dice?.repair, random);
    const amt = roll >= 10 ? 2 : roll >= 7 ? 1 : 0;
    const loc = LOCS.includes(String(a.loc || "").toLowerCase()) ? a.loc.toLowerCase() : "hull";
    if (amt > 0) repairRig(rig, loc, amt);
    pushResolution(room, {
      kind: "repair", actor: rig.owner, rigId: rig.id,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name} repair — rolled ${roll} → ${amt} SP to ${loc}`, effects: [],
    });
  } else if (act === "prepare") {
    rig.preparation = { type: String(a.prep || "brace"), source: "action" };
  }
  bumpHeat(rig, def.heat);
  t.actionsUsed += 1;
  return true;
}

// A side that owns rigs but has none left standing loses immediately (§4).
function checkAnnihilation(room) {
  if (!room.game.started || room.game.outcome) return;
  for (const side of room.game.sides) {
    const owns = room.rigs.some((r) => (r.owner || "a") === side.id);
    const alive = room.rigs.some((r) => (r.owner || "a") === side.id && !r.destroyed);
    if (owns && !alive) {
      room.game.outcome = { winner: side.id === "a" ? "b" : "a", reason: "annihilation" };
      room.game.phase = "finished";
      return;
    }
  }
}

// After both sides score Recovery VP: advance to the next round's initiative,
// or — at round 5 (or beyond, in Sudden Death) — resolve victory by points,
// enter one Sudden Death round on a tie, or declare a draw if still tied.
function advanceRound(room) {
  const [sa, sb] = room.game.sides;
  const lastRound = room.game.suddenDeath || room.game.round >= 5;
  if (lastRound) {
    if (sa.vp !== sb.vp) {
      room.game.outcome = { winner: sa.vp > sb.vp ? sa.id : sb.id, reason: "points" };
      room.game.phase = "finished";
    } else if (!room.game.suddenDeath) {
      room.game.suddenDeath = true;
      room.game.round += 1;
      room.game.phase = "initiative";
      room.game.initiative = null;
    } else {
      room.game.outcome = { winner: null, reason: "draw" };
      room.game.phase = "finished";
    }
  } else {
    room.game.round += 1;
    room.game.phase = "initiative";
    room.game.initiative = null;
  }
}

// Apply a single normalized command { verb, attrs } to the room in place.
// Returns the room. Bumps room.version only when something actually changed.
export function applyCommand(room, cmd, context = {}, options = {}) {
  ensureGameShape(room);
  const verb = (cmd?.verb || "").toLowerCase();
  const a = cmd?.attrs || {};
  let changed = false;

  if (verb === "add") {
    if (a.name && !findRig(room, a.name)) {
      const owner = normalizeSide(room, a.owner) || normalizeSide(room, context.side) || "a";
      if (canAddRigForSide(room, owner)) {
        const rig = makeRig(room.nextRigId, a.name, (a.class || "").toLowerCase(), owner, a);
        if (!rig) return room;
        room.nextRigId++;
        room.rigs.push(rig);
        resetReadyBeforeStart(room);
        changed = true;
      }
    }
  } else if (verb === "remove") {
    const rig = findRig(room, a.name);
    if (rig) {
      room.rigs = room.rigs.filter((r) => r !== rig);
      resetReadyBeforeStart(room);
      changed = true;
    }
  } else if (verb === "ready") {
    const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
    const side = room.game.sides.find((s) => s.id === sideId);
    if (side && !room.game.started && sideRigCount(room, side.id) >= 3 && !side.ready) {
      side.ready = true;
      if (!room.game.deployOrder.includes(side.id)) room.game.deployOrder.push(side.id);
      maybeStartGame(room, options.random);
      changed = true;
    }
  } else if (verb === "setdice") {
    if (!room.game.started) {
      const want = String(a.value || "").toLowerCase() !== "manual";
      if (room.game.autoResolve !== want) { room.game.autoResolve = want; changed = true; }
    }
  } else if (verb === "initiative") {
    if (room.game.phase === "initiative") {
      const auto = a.dice == null;
      let ra = rollD(12, a.dice?.a, options.random);
      let rb = rollD(12, a.dice?.b, options.random);
      if (auto) { while (ra === rb) { ra = rollD(12, null, options.random); rb = rollD(12, null, options.random); } }
      if (ra !== rb) {
        const order = ra > rb ? ["a", "b"] : ["b", "a"];
        applyInitiative(room, order, { a: ra, b: rb });
        pushResolution(room, {
          kind: "initiative", actor: order[0], rigId: null,
          rolls: [{ sides: 12, value: ra, label: "Side A" }, { sides: 12, value: rb, label: "Side B" }],
          summary: `Round ${room.game.round} initiative — ${order[0]} first (${ra} vs ${rb})`,
          effects: [],
        });
        changed = true;
      }
    }
  } else if (verb === "activate") {
    const rig = findRig(room, a.name);
    const t = room.game.turn;
    if (rig && t && room.game.phase === "activation" && t.activeRigId == null &&
        (rig.owner || "a") === t.side && !rig.destroyed && !rig.activated) {
      if (rig.skipNextActivation) {
        rig.skipNextActivation = false;
        rig.activated = true;
        pushResolution(room, { kind: "skip", actor: rig.owner, rigId: rig.id, rolls: [],
          summary: `${rig.name} loses this activation (engine offline).`, effects: [] });
        handoff(room);
      } else {
        t.activeRigId = rig.id;
        t.actionsUsed = 0;
        t.actionsMax = 5 - (rig.hull.sp === 0 ? 2 : 0);
        rig.loaded = { longRange: true, melee: true };
      }
      changed = true;
    }
  } else if (verb === "action") {
    const rig = findRig(room, a.name);
    const t = room.game.turn;
    if (rig && t && room.game.phase === "activation" && t.activeRigId === rig.id) {
      changed = performAction(room, rig, String(a.action || "").toLowerCase(), a, options.random);
    }
  } else if (verb === "endactivation") {
    const rig = findRig(room, a.name);
    const t = room.game.turn;
    if (rig && t && room.game.phase === "activation" && t.activeRigId === rig.id) {
      endActivation(room, rig, a.dice, options.random);
      changed = true;
    }
  } else if (verb === "vp") {
    if (room.game.phase === "recovery") {
      const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
      if (sideId && !room.game.recoveryVp[sideId]) {
        const side = room.game.sides.find((s) => s.id === sideId);
        side.vp += Math.max(0, Math.floor(Number(a.points) || 0));
        room.game.recoveryVp[sideId] = true;
        if (room.game.sides.every((s) => room.game.recoveryVp[s.id])) advanceRound(room);
        changed = true;
      }
    }
  } else if (verb === "answer") {
    const rig = findRig(room, a.name);
    const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
    if (rig && sideId && (rig.owner || "a") === sideId &&
        room.game.answerTokens[sideId] > 0 && rig.preparation == null) {
      rig.preparation = { type: String(a.prep || "brace"), source: "answer" };
      room.game.answerTokens[sideId] -= 1;
      changed = true;
    }
  } else {
    const rig = findRig(room, a.name);
    if (rig) {
      if (verb === "damage") { damageRig(rig, (a.loc || "").toLowerCase(), a.amount); checkAnnihilation(room); changed = true; }
      else if (verb === "repair") { repairRig(rig, (a.loc || "").toLowerCase(), a.amount); changed = true; }
      else if (verb === "set") { setRigSp(rig, (a.loc || "").toLowerCase(), a.sp); changed = true; }
      else if (verb === "heat") { heatRig(rig, a.amount); changed = true; }
    }
  }

  if (changed) room.version++;
  return room;
}

// The room view sent to clients — omit internal bookkeeping.
export function publicState(room, side) {
  ensureGameShape(room);
  const sideId = normalizeSide(room, side);
  const bounties = {};
  if (sideId && room.game.bounties[sideId]) bounties[sideId] = room.game.bounties[sideId];
  return {
    code: room.code,
    version: room.version,
    game: {
      ...room.game,
      sides: room.game.sides.map((s) => ({ ...s })),
      objectives: room.game.objectives.map((objective) => ({ ...objective })),
      bounties,
    },
    rigs: room.rigs,
  };
}

// Human-readable battle-state block injected into the chat system prompt.
export function formatBattleState(room, side) {
  ensureGameShape(room);
  const g = room.game;
  const lines = ["", "=== CURRENT BATTLE STATE ==="];
  lines.push(`Round ${g.round}/5`);
  lines.push(`Sides: ${g.sides.map((s) => `${s.name} (${s.id}) VP ${s.vp}${s.ready ? " READY" : ""}`).join(" | ")}`);
  lines.push(`Battle started: ${g.started ? "yes" : "no"}`);
  lines.push(`Phase: ${g.phase}${g.outcome ? ` (winner: ${g.outcome.winner || "draw"})` : ""}`);
  if (g.turn) {
    const active = g.turn.activeRigId ? room.rigs.find((x) => x.id === g.turn.activeRigId) : null;
    const acting = active ? ` — ${active.name} (${g.turn.actionsUsed}/${g.turn.actionsMax} actions)` : "";
    lines.push(`Turn: ${g.turn.side}${acting}`);
  }
  if (room.rigs.length === 0) {
    lines.push("(No Rigs are being tracked yet.)");
  } else {
    for (const rig of room.rigs) {
      const parts = LOCS.map((loc) => {
        const c = rig[loc];
        let tag = `${loc} ${c.sp}/${c.max}`;
        if (loc === "engine") tag += ` heat ${c.heat}`;
        if (c.destroyed) tag += " (DESTROYED)";
        else if (c.sp === 0) tag += " (CATASTROPHIC)";
        return tag;
      });
      const status = rig.destroyed ? " [RIG DESTROYED]" : "";
      const weapons = rig.weapons
        ? `; weapons ${rig.weapons.longRange || "?"} / ${rig.weapons.melee || "?"}`
        : "";
      lines.push(`- ${rig.name} (${rig.weightClass}, owner ${rig.owner})${status}: ${parts.join(", ")}${weapons}`);
    }
  }
  const sideId = normalizeSide(room, side);
  const bountyId = sideId ? g.bounties[sideId] : null;
  const bounty = bountyId ? room.rigs.find((rig) => rig.id === bountyId) : null;
  if (bounty) lines.push(`Your Ironclad Bounty: ${bounty.name}`);
  return lines.join("\n");
}

export const __test = { applyDamage, applyOverheat };
