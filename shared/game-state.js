export const RIG_DEFAULTS = {
  light:    { hull: 6, arms: 5, legs: 5, engine: 4 },
  medium:   { hull: 7, arms: 6, legs: 6, engine: 5 },
  heavy:    { hull: 8, arms: 7, legs: 7, engine: 6 },
  colossal: { hull: 9, arms: 8, legs: 8, engine: 7 },
};
export const LOCS = ["hull", "arms", "legs", "engine"];
export const SUPPORTED_RIG_CLASSES = ["light", "medium"];
export const MAX_RIGS_PER_SIDE = 3;
export const MAX_RIGS_TOTAL = 6;
export const WEAPONS = {
  longRange: ["Mini Gun", "Double MG", "Autocannon", "Arc Gun", "Mortar", "Sniper Cannon"],
  melee: ["Sword", "Circular Saw", "Chainsaw", "Claw", "Lance", "Wrecking Ball"],
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
    },
    rigs: [],
  };
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
  return room;
}

export function normalizeWeapon(category, name) {
  const list = WEAPONS[category];
  if (!list || !name) return null;
  const ref = String(name).trim().toLowerCase();
  return list.find((weapon) => weapon.toLowerCase() === ref) || null;
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
    destroyed: false,
  };
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
  if (loc === "engine" && c.sp === 0) c.heat = Math.max(c.heat, 3);
  recompute(rig);
}

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
      maybeStartGame(room, options.random);
      changed = true;
    }
  } else {
    const rig = findRig(room, a.name);
    if (rig) {
      if (verb === "damage") { damageRig(rig, (a.loc || "").toLowerCase(), a.amount); changed = true; }
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
