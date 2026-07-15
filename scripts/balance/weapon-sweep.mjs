// Monte Carlo weapon-balance harness v2.
// Sweep: weapon × upgrade tier (base/field/tuned/prototype) × attacker class ×
//        target kind × arc × distance × condition profile.
// Metric: mean SP dealt by ONE attack action, no cover, no aim.
//
// Two condition profiles bracket every conditional upgrade:
//   cold   — fresh target, cold attacker, no charge  (Cold Bore lives here)
//   primed — half-dead target, overheated/charging attacker, target pinned
//            (Evisceration / Exploit Wound / Bloodletter / Taut Cable /
//             Opportunist / Redline / Superconductor / Full Tilt live here)

import { resolveAttack } from "../../shared/combat.js";
import { WEAPONS, WEAPON_UPGRADES, makeRig, effectiveWeaponProfile } from "../../shared/game-state.js";
import { HEAT_CAPACITY } from "../../shared/rules.js";

const TRIALS = Number(process.env.TRIALS || 2000);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let LEDGER = null; // set per trial: { target, sp }
const STUBS = {
  pushResolution() {},
  // The volley's real damage tap. rollWounds' impacts are only PART of a shot:
  // Mortar's cluster-shells lands a second location through this seam
  // (combat.js:1102). Counting impacts alone read those upgrades as inert.
  // Only damage to the PRIMARY target counts � cleave (combat.js:1014) hits a
  // different rig and is not this shot's output.
  applyDamage(room, rig, loc, amount) { if (LEDGER && rig === LEDGER.target) LEDGER.sp += amount; },
  bumpHeat() {}, spendHeat() {},
  sunderLocation() {}, crackLocation() {}, rivetHit() {}, dismemberLocation() {},
  breachHull() {}, engage() {},
};
// Real ctx — the profile a live rig actually fires.
const ctx = { ...STUBS, profileFor: (slot, name, attacker) => effectiveWeaponProfile(slot, name, attacker) };
// SYNTHETIC baseline ctx. normalizeWeaponUpgrade() falls back to upgrades[0] (the
// FIELD upgrade) for a null id, so an un-upgraded rig is UNREACHABLE in the real
// game — makeRig cannot build one. This bypasses that fallback to measure what
// each tier is actually worth. Not a legal loadout; a measuring stick only.
const baseCtx = {
  ...STUBS,
  profileFor: (slot, name) => {
    const b = WEAPONS[slot]?.[name];
    if (!b) return null;
    const p = { ...b, perks: b.perks || [], upgrade: null, upgradeEffect: {} };
    if (b.melee) { p.acc = [...b.acc]; p.rng = [...b.rng]; }
    return p;
  },
};

const ROOM = { game: { round: 1 } };
const ARCS = ["front", "side", "rear"];

// Rigs only. Tanks/Walkers are out of scope for this balance pass.
const TARGETS = [
  { key: "rig-light", make: () => makeRig("t", "T", "light", "b", { longRange: "Autocannon", melee: "Claw" }) },
  { key: "rig-medium", make: () => makeRig("t", "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" }) },
];

function partsOf(u) {
  return u.kind === "rig" ? ["hull", "arms", "legs", "engine"] : Object.keys(u.parts);
}
function partRef(u, name) { return u.kind === "rig" ? u[name] : u.parts[name]; }

// primed: every conditional bonus that depends on the DEFENDER's state is armed
function primeTarget(t) {
  for (const p of partsOf(t)) {
    const ref = partRef(t, p);
    ref.sp = Math.max(1, Math.floor(ref.max / 2)); // half-dead → Evisceration/Exploit Wound/Bloodletter
  }
  t.immobilised = true;          // Taut Cable
  t.engagedWith = "a";
  t.actionPenaltyNextActivation = 1; // Opportunist (disrupted)
  const cap = HEAT_CAPACITY[t.weightClass];
  if (cap != null && t.engine) t.engine.heat = cap + 1;
  return t;
}
// primed: everything that depends on the ATTACKER's state
function primeAttacker(a) {
  a.movedThisActivation = true;  // Full Tilt / Momentum Swing
  const cap = HEAT_CAPACITY[a.weightClass];
  if (cap != null && a.engine) a.engine.heat = cap + 3; // Redline +3, Superconductor +2
  a.momentum = 3;                // Piledriver Protocol
  return a;
}

function makeAttacker(kind, weaponName, slot, upgradeId) {
  if (slot === "unit") return makeUnit(kind, "a", "A", "a", { unit: weaponName });
  const lr = slot === "longRange" ? weaponName : "Autocannon";
  const me = slot === "melee" ? weaponName : "Claw";
  const w = { longRange: lr, melee: me };
  if (slot === "longRange") w.longRangeUpgrade = upgradeId;
  else w.meleeUpgrade = upgradeId;
  const rig = makeRig("a", "A", kind, "a", w);
  // makeRig normalizes an unknown/absent upgrade to null — assert the tier we asked
  // for is the tier we got, so a typo can't silently degrade a whole tier to base.
  if (rig && upgradeId && rig.weaponUpgrades[slot] !== upgradeId)
    throw new Error(`upgrade ${upgradeId} rejected for ${weaponName}`);
  return rig;
}

function runCell({ slot, weaponName, tier, upgradeId, attackerKind, targetDef, arc, distance, cond }) {
  const rnd = mulberry32(0xC0FFEE);
  let attackerProto = makeAttacker(attackerKind, weaponName, slot, upgradeId);
  let targetProto = targetDef.make();
  if (!attackerProto || !targetProto) throw new Error(`build fail ${weaponName}/${tier}/${attackerKind}`);
  if (cond === "primed") { attackerProto = primeAttacker(attackerProto); targetProto = primeTarget(targetProto); }

  let spTotal = 0, wounding = 0, hitDice = 0, blocked = 0;
  for (let i = 0; i < TRIALS; i++) {
    const a = structuredClone(attackerProto);
    const t = structuredClone(targetProto);
    const opts = { weapon: slot === "unit" ? "longRange" : slot, arc, cover: 0 };
    if (distance != null) opts.distance = distance;
    LEDGER = { target: t, sp: 0 };
    const r = resolveAttack(ROOM, a, t, opts, rnd, tier === "none" ? baseCtx : ctx);
    if (!r.ok) { blocked++; LEDGER = null; continue; }
    hitDice += r.hits || 0;
    const sp = LEDGER.sp;
    LEDGER = null;
    if (sp > 0) wounding++;
    spTotal += sp;
  }
  const n = TRIALS - blocked;
  return {
    slot, weapon: weaponName, tier, upgrade: upgradeId || "-", attacker: attackerKind,
    target: targetDef.key, arc, distance: distance == null ? "melee" : distance, cond,
    blocked, n,
    sp: n ? spTotal / n : 0,
    hitDice: n ? hitDice / n : 0,
    woundRate: n ? wounding / n : 0,
  };
}

function distancesFor(p) {
  const set = new Set();
  const push = (d) => { const r = Math.round(d); if (r >= p.minRange && r <= p.maxRange) set.add(r); };
  push(p.minRange);
  push(p.sweet - 6); push(p.sweet - 4); push(p.sweet - 2);
  push(p.sweet);
  push(p.sweet + 2); push(p.sweet + 4); push(p.sweet + 6);
  push((p.sweet + p.maxRange) / 2);
  push(p.maxRange);
  return [...set].sort((x, y) => x - y);
}

function tiersFor(weaponName) {
  const out = [{ tier: "none", id: null }]; // synthetic — see baseCtx
  for (const u of WEAPON_UPGRADES[weaponName] || []) out.push({ tier: u.nature, id: u.id });
  return out;
}

// Guard the exact failure that made the first run garbage: `base` silently
// resolving to the field upgrade, so two tiers were the same weapon. Every rig
// weapon must expose 3 upgrade ids, and each must yield a distinct profile from
// the synthetic no-upgrade baseline.
for (const [slot, table] of [["longRange", WEAPONS.longRange], ["melee", WEAPONS.melee]]) {
  for (const name of Object.keys(table)) {
    const tiers = tiersFor(name);
    if (tiers.length !== 4) throw new Error(`${name}: expected 3 upgrades, got ${tiers.length - 1}`);
    const seen = new Set();
    for (const { tier, id } of tiers) {
      const rig = makeAttacker("medium", name, slot, id);
      const p = tier === "none" ? baseCtx.profileFor(slot, name) : ctx.profileFor(slot, name, rig);
      const sig = JSON.stringify([p.rof, p.pen, p.d, p.perks?.slice().sort(), p.upgrade?.id ?? null]);
      if (tier !== "none" && p.upgrade?.id !== id) throw new Error(`${name}/${tier}: profile carries ${p.upgrade?.id}, wanted ${id}`);
      seen.add(sig);
    }
    if (seen.size < 2) throw new Error(`${name}: all 4 tiers produced an identical profile`);
  }
}

const rows = [];
let done = 0;
const tick = () => { if (++done % 2000 === 0) process.stderr.write(`  ${done} cells\n`); };

for (const [slot, table] of [["longRange", WEAPONS.longRange], ["melee", WEAPONS.melee]]) {
  for (const weaponName of Object.keys(table)) {
    const base = table[weaponName];
    const dists = slot === "melee" ? [null] : distancesFor(base);
    for (const { tier, id } of tiersFor(weaponName)) {
      for (const attackerKind of ["light", "medium"]) {
        for (const targetDef of TARGETS) {
          for (const arc of ARCS) {
            for (const distance of dists) {
              for (const cond of ["cold", "primed"]) {
                rows.push(runCell({ slot, weaponName, tier, upgradeId: id, attackerKind, targetDef, arc, distance, cond }));
                tick();
              }
            }
          }
        }
      }
    }
  }
}

process.stderr.write(`total cells ${rows.length}\n`);
process.stdout.write(JSON.stringify({ trials: TRIALS, rows }));
