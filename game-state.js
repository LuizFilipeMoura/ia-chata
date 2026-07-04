export const RIG_DEFAULTS = {
  light:    { hull: 6, arms: 5, legs: 5, engine: 4 },
  medium:   { hull: 7, arms: 6, legs: 6, engine: 5 },
  heavy:    { hull: 8, arms: 7, legs: 7, engine: 6 },
  colossal: { hull: 9, arms: 8, legs: 8, engine: 7 },
};
export const LOCS = ["hull", "arms", "legs", "engine"];

export function createRoom(code) {
  return {
    code,
    version: 0,
    nextRigId: 1,
    game: {
      round: 1,
      sides: [
        { id: "a", name: "You",   vp: 0, claimed: false },
        { id: "b", name: "Enemy", vp: 0, claimed: false },
      ],
      objectives: [],
    },
    rigs: [],
  };
}

export function makeRig(id, name, cls, owner) {
  const weightClass = RIG_DEFAULTS[cls] ? cls : "medium";
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
    weapons: [],   // Phase 2
    prepare: 0,    // Phase 4
    destroyed: false,
  };
}

export function findRig(room, name) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  return room.rigs.find((r) => r.name.toLowerCase() === n) || null;
}

export function normalizeSide(room, ref) {
  if (!ref) return null;
  const s = String(ref).trim().toLowerCase();
  const byId = room.game.sides.find((x) => x.id === s);
  if (byId) return byId.id;
  const byName = room.game.sides.find((x) => x.name.toLowerCase() === s);
  return byName ? byName.id : null;
}

export function claimSide(room, { name, side } = {}) {
  let target = side ? room.game.sides.find((s) => s.id === side && !s.claimed) : null;
  if (!target) target = room.game.sides.find((s) => !s.claimed);
  if (!target) return null;
  target.claimed = true;
  if (name) target.name = String(name).trim() || target.name;
  room.version++;
  return target.id;
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
export function applyCommand(room, cmd) {
  const verb = (cmd?.verb || "").toLowerCase();
  const a = cmd?.attrs || {};
  let changed = false;

  if (verb === "add") {
    if (a.name && !findRig(room, a.name)) {
      const owner = normalizeSide(room, a.owner) || "a";
      room.rigs.push(makeRig(room.nextRigId++, a.name, (a.class || "").toLowerCase(), owner));
      changed = true;
    }
  } else if (verb === "remove") {
    const rig = findRig(room, a.name);
    if (rig) { room.rigs = room.rigs.filter((r) => r !== rig); changed = true; }
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
export function publicState(room) {
  return { code: room.code, version: room.version, game: room.game, rigs: room.rigs };
}

// Human-readable battle-state block injected into the chat system prompt.
export function formatBattleState(room) {
  const g = room.game;
  const lines = ["", "=== CURRENT BATTLE STATE ==="];
  lines.push(`Round ${g.round}/5`);
  lines.push(`Sides: ${g.sides.map((s) => `${s.name} (${s.id}) VP ${s.vp}`).join(" | ")}`);
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
      lines.push(`- ${rig.name} (${rig.weightClass}, owner ${rig.owner})${status}: ${parts.join(", ")}`);
    }
  }
  return lines.join("\n");
}
