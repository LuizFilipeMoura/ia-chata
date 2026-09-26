// The Director turns engine state into a show. It owns one Mech per rig and
// plays frames, { rigs, log, cmd, round, … } snapshots, from a live push, a bot
// turn, or a GA replay, as animation: walks along routed paths, per-weapon
// projectiles, impact sparks + damage numbers, cook-offs, overheat steam. Frames
// queue, so a whole bot turn plays out move by move.
import * as THREE from "three";
import { Mech } from "../scene/mechs.js";
import { CHASSIS, LOCS, EQUIPMENT, WEAPONS } from "/shared/game-state.js";
import { HEAT_CAPACITY } from "/shared/rules.js";
import { BASE_RADIUS } from "/shared/geometry.js";
import { sfx } from "../audio.js";
import { barkFor } from "./barks.js";
import { settings } from "../settings.js";

const PROJECTILE = {
  "Autocannon": "cannon", "Missile Barrage": "missile", "Mini Gun": "bullet", "Double MG": "bullet",
  "Arc Gun": "arc", "Harpoon": "harpoon", "Rivet Gun": "rivet", "Mortar": "lob", "Siege Maul": "cannon",
  "Sniper Cannon": "rail", "Crossbow": "bolt",
};
const BURST = { "Mini Gun": 6, "Double MG": 4, "Missile Barrage": 4, "Autocannon": 2, "Rivet Gun": 3 };
const MELEE_NAMES = new Set(CHASSIS.map((c) => c.melee));

export function chassisOf(r) { return CHASSIS.find((c) => c.id === r.chassis) || null; }

// A publicState room → the same frame shape match.js records.
export function frameFromState(state, sinceResolutionId = -1) {
  const g = state.game;
  return {
    cmd: null, round: g.round, phase: g.phase,
    turn: g.turn ? { side: g.turn.side, activeRigId: g.turn.activeRigId } : null,
    vp: g.sides.map((s) => s.vp || 0),
    rigs: state.rigs.map((r) => ({
      id: r.id, name: r.name, owner: r.owner || "a", chassis: r.chassis ?? null, pos: r.pos, facing: r.facing ?? 0,
      destroyed: !!r.destroyed, heat: r.engine?.heat ?? 0,
      smoked: !!r.smokeNextActivation, hardened: !!r.hardened,
      sp: Object.fromEntries(LOCS.map((l) => [l, r[l] ? [r[l].sp, r[l].max] : [0, 0]])),
    })),
    log: (g.resolutions || []).filter((x) => x.id > sinceResolutionId),
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Which equipment active a resolution reports. The engine tags it (`active`);
// older / narrated resolutions only carry a summary, so fall back to that.
const ACTIVE_BY_LABEL = Object.fromEntries(Object.values(EQUIPMENT).map((e) => [e.active.label, e.active.key]));
export function equipmentActiveOf(l) {
  if (l.kind !== "equipment") return null;
  if (l.active) return l.active;
  const s = l.summary || "";
  if (/Grapnel/i.test(s)) return "grapnel";
  if (/vents cryo/i.test(s)) return "cryo";
  if (/nanite/i.test(s)) return "nanite";
  if (/banks \d+ meltdown/i.test(s)) return "meltdown-bank";
  if (/meltdown burst|overloads/i.test(s)) return "meltdown";
  const m = /uses (.+?)\.\s*$/.exec(s);
  return (m && ACTIVE_BY_LABEL[m[1]]) || null;
}
// Grapnel reel drags the victim; yank hops the grappler.
const isReel = (l) => l.mode === "reel" || (l.mode == null && (l.victims?.length > 0 || /Reel/i.test((l.effects || []).join(" "))));

export class Director {
  // Hooks (all optional): onLog(entry, round), onBanner(text, kind),
  // onCamera(point, { punch, owner }) to follow the action, onDice(entry) → a
  // promise that resolves when the tray's first dice land, onScore(entry).
  // `side` is whose point of view the sounds take ("a" in replays).
  constructor(world, { onLog, onBanner, onCamera, onDice, onScore, side = "a", quiet = false } = {}) {
    this.world = world;
    this.onCamera = onCamera || (() => {});
    this.onDice = onDice || null;
    this.onScore = onScore || (() => {});
    this.side = side;
    this.quiet = quiet;          // attract mode: no sound, no barks
    this.skipping = false;       // "skip", snap through queued frames
    this.drops = new Set();
    this.mechs = new Map();
    this.onLog = onLog || (() => {});
    this.onBanner = onBanner || (() => {});
    this.speed = 1;
    this.queue = Promise.resolve();
    this.current = null;
    this.busy = 0;
    this.walkers = new Set();
    this.lifts = new Set();      // extracting mechs rising off the table
    this.commanderId = null;     // campaign: the crowned enemy rig
    this.tickFn = (dt) => this.tick(dt);
    world.tickers.add(this.tickFn);
  }

  get idle() { return this.busy === 0; }

  // Done for good (screen closed): clear, stop ticking, and make any animation
  // still in flight unable to put mechs back on the table.
  dispose() {
    this.reset();
    this.detached = true;
    this.world.tickers.delete(this.tickFn);
  }

  // Clearing bumps the epoch: any frame queued before this (a title-screen
  // skirmish, a replay step, a bot turn still animating) is dropped instead of
  // re-creating its mechs on whatever screen comes next.
  reset() {
    this.epoch = (this.epoch || 0) + 1;
    for (const w of this.walkers) w.resolve();
    this.walkers.clear();
    for (const d of this.drops) d.done?.();
    this.drops.clear();
    for (const L of this.lifts) L.done?.();
    this.lifts.clear();
    this.dropDone?.();
    for (const m of this.mechs.values()) this.world.scene.remove(m.root);
    this.mechs.clear();
    this.current = null;
    this.world.mechRoots = [];
  }

  ensureMech(r) {
    let m = this.mechs.get(r.id);
    if (m) return m;
    if (this.detached) return { root: new THREE.Object3D(), update() {}, setPose() {}, setHeat() {}, setHurt() {}, setParts() {}, destroy() {}, aimAt() {}, fire() {}, stacks: [], legs: [] };
    const ch = chassisOf(r) || {};
    m = new Mech({
      id: r.id, name: r.name, owner: r.owner, chassis: r.chassis,
      weightClass: ch.class || "light", longRange: ch.longRange, melee: ch.melee,
      radius: BASE_RADIUS[ch.class || "light"],
    });
    m.chassisDef = ch;
    if (r.pos) m.setPose(r.pos, r.facing);
    this.world.scene.add(m.root);
    this.mechs.set(r.id, m);
    this.world.mechRoots = [...this.mechs.values()].map((x) => x.root);
    return m;
  }

  // A rig left the table for good (Breakthrough extraction): drop its mech.
  removeMech(id) {
    const m = this.mechs.get(id);
    if (!m) return;
    this.world.scene.remove(m.root);
    this.mechs.delete(id);
    this.world.mechRoots = [...this.mechs.values()].map((x) => x.root);
  }

  // Mechs whose rig is gone from the frame (extracted) leave with it.
  prune(frame) {
    const ids = new Set(frame.rigs.map((r) => r.id));
    for (const id of [...this.mechs.keys()]) if (!ids.has(id) && ![...this.lifts].some((L) => L.m.id === id)) this.removeMech(id);
  }

  // Snap to a frame with no animation (initial load, replay scrubbing).
  snap(frame) {
    for (const r of frame.rigs) {
      const m = this.ensureMech(r);
      m.pendingDrop = false; m.root.visible = true;
      if (r.pos) m.setPose(r.pos, r.facing);
      this.applyStatus(m, r);
      if (r.destroyed && !m.destroyed) m.destroy();
    }
    this.prune(frame);
    this.current = frame;
  }

  applyStatus(m, r) {
    const cap = HEAT_CAPACITY[m.weightClass] ?? 6;
    m.setHeat(r.heat / cap);
    const tot = LOCS.reduce((a, l) => a + (r.sp[l]?.[0] || 0), 0), max = LOCS.reduce((a, l) => a + (r.sp[l]?.[1] || 0), 0);
    m.setHurt(max ? 1 - tot / max : 0);
    m.setParts?.(Object.fromEntries(LOCS.map((l) => [l, (r.sp[l]?.[1] || 0) > 0 && (r.sp[l]?.[0] || 0) <= 0])));
    m.setCrown?.(this.commanderId != null && r.id === this.commanderId && !r.destroyed);
    m.data = r;
  }

  // Queue a frame for animated playback. Returns when it has finished playing.
  play(frame) {
    this.busy++;
    const epoch = this.epoch || 0;
    this.queue = this.queue.then(() => (epoch === (this.epoch || 0) ? this.animate(frame) : null)).catch((e) => console.error(e)).finally(() => { this.busy--; if (!this.busy) this.skipping = false; });
    return this.queue;
  }

  // Jump to the end of whatever is queued: finish walks now, snap the rest.
  skip() {
    if (this.idle) return;
    this.skipping = true;
    for (const w of this.walkers) { w.m.root.position.set(w.to.x, 0, w.to.y); w.m.targetFacing = w.facing; w.resolve(); }
    this.walkers.clear();
  }

  sound(fn) { if (!this.quiet && !this.skipping) fn(); }

  // A pilot on the radio. `other` = the machine they're talking about,
  // `part` = the part that got hit. No line repeats within a battle.
  bark(m, event, { other = null, part = null } = {}) {
    if (this.quiet || this.skipping || !m || !settings.get("barks")) return;
    this.barksUsed ||= new Set();
    const b = barkFor(m, event, { other, part, used: this.barksUsed, campaign: this.campaign });
    if (!b) return;
    this.world.fx.bubble(m.root.position.clone().add(new THREE.Vector3(0, 3.4, 0)), b.line, b.warlord ? "#f0cf7a" : m.owner === "a" ? "#5fd3c0" : "#e0533d", b.pilot);
    sfx.bark();
  }

  // Opening drop: every mech falls from the sky on thrusters and slams down.
  async dropIn(frame) {
    this.snap(frame);
    const mechs = [...this.mechs.values()];
    mechs.forEach((m, i) => { m.root.position.y = 40 + i * 6; this.drops.add({ m, v: 0, delay: i * 0.35, landed: false }); });
    this.sound(() => sfx.thrusters());
    await new Promise((resolve) => { this.dropDone = resolve; });
  }

  async animate(frame) {
    const prev = this.current;
    if (!prev) { this.snap(frame); frame.log?.forEach((l) => this.onLog(l, frame.round)); return; }
    if (this.skipping) {
      this.snap(frame);
      frame.log?.forEach((l) => {
        this.onLog(l, frame.round);
        if (l.kind === "crate") { this.world.claimCrate(l.x, l.y); this.onScore(l); }
        if (l.kind === "reinforcement") this.onBanner("Enemy reinforcements!", "stinger");
      });
      for (const r of frame.rigs) { const m = this.mechs.get(r.id); if (r.destroyed && m && !m.destroyed) m.destroy(); }
      return;
    }
    const byId = new Map(prev.rigs.map((r) => [r.id, r]));
    this.announced = new Set();
    if (frame.round !== prev.round && frame.round) this.onBanner(`Round ${frame.round}`, "round");

    // 1. Movement. Hops (Jump Jets, Grapnel), reels and Chaff side-steps play
    // with their own event below, not as a walk.
    const deferred = new Set();
    for (const l of frame.log || []) {
      const act = equipmentActiveOf(l);
      if (act === "jumpjets") deferred.add(l.rigId);
      else if (act === "grapnel") deferred.add(isReel(l) ? (l.victims?.[0] ?? l.targetId) : l.rigId);
      else if (l.chaff) deferred.add(l.rigId);
    }
    const walks = [];
    for (const r of frame.rigs) {
      // A rig we've never seen mid-battle (Last Stand reinforcements) waits
      // hidden in orbit until its drop plays.
      const fresh = !this.mechs.has(r.id) && !byId.has(r.id);
      const m = this.ensureMech(r);
      if (fresh && r.pos && !this.detached) { m.root.visible = false; m.pendingDrop = true; }
      const p = byId.get(r.id);
      if (deferred.has(r.id)) continue;
      if (r.pos && p?.pos && (Math.hypot(r.pos.x - p.pos.x, r.pos.y - p.pos.y) > 0.05)) {
        if (!walks.length) this.onCamera({ x: (p.pos.x + r.pos.x) / 2, y: (p.pos.y + r.pos.y) / 2 }, { owner: r.owner });
        walks.push(this.walk(m, p.pos, r.pos, r.facing, (r.sp.legs?.[1] || 0) > 0 && r.sp.legs[0] <= 0));
      }
      else if (r.pos && p && Math.abs(((r.facing - p.facing + 540) % 360) - 180) > 1) { m.targetFacing = r.facing; }
    }
    if (walks.length) await Promise.all(walks);

    // 2. Events.
    for (const l of frame.log || []) {
      this.onLog(l, frame.round);
      await this.event(l, frame, prev);
    }

    // 3. Status (and any part that broke off-screen of an attack: overheat, blasts).
    for (const r of frame.rigs) {
      const p = byId.get(r.id);
      if (p && !r.destroyed) for (const loc of LOCS) this.announceBreak(r, p, loc);
    }
    for (const r of frame.rigs) {
      const m = this.ensureMech(r);
      if (m.pendingDrop) await this.dropOne(m, r);
      if (r.pos && !this.walkers.size) m.setPose(r.pos, r.facing);
      this.applyStatus(m, r);
      if (r.destroyed && !m.destroyed) {
        // Kill shot: punch the camera in and hold a beat on the wreck.
        this.onCamera({ x: m.root.position.x, y: m.root.position.z }, { punch: true, owner: r.owner });
        this.world.fx.explosion(m.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)), true);
        this.sound(() => sfx.explosion(true));
        m.destroy();
        this.onBanner(`${r.name} DESTROYED`, "stinger");
        await wait(900 / this.speed);
      }
    }
    this.prune(frame);
    this.current = frame;
    await wait(120 / this.speed);
  }

  // One mech falls in from orbit on thrusters and slams down (reinforcements).
  async dropOne(m, r) {
    m.pendingDrop = false;
    if (r?.pos) m.setPose(r.pos, r.facing);
    m.root.visible = true;
    if (this.skipping || this.detached) { m.root.position.y = 0; return; }
    this.onCamera({ x: m.root.position.x, y: m.root.position.z }, { owner: m.owner, score: true });
    m.root.position.y = 38;
    this.sound(() => sfx.thrusters());
    await new Promise((done) => this.drops.add({ m, v: 0, delay: 0.15, landed: false, done }));
    const fx = this.world.fx, at = m.root.position.clone();
    fx.shockwave(at.clone().setY(0.1), m.radius + 3, m.owner === "a" ? 0x5fd3c0 : 0xe0533d, 0.7);
    fx.burst(at.clone().add(new THREE.Vector3(0, 0.4, 0)), 26, { color: 0x9a8a70, size: 1, life: 1.1, spread: 7, additive: false, opacity: 0.6, up: 0.5 });
    fx.sparks(at.clone().add(new THREE.Vector3(0, 0.3, 0)), 18);
    this.world.fx.shake = Math.max(this.world.fx.shake, 0.55);
    this.sound(() => sfx.land());
    await wait(350 / this.speed);
  }

  // Extraction: thrusters spool, the mech rises off the table and fades out,
  // then it's gone from the scene.
  liftOff(m) {
    if (this.skipping || this.detached) { this.removeMech(m.id); return Promise.resolve(); }
    return new Promise((done) => this.lifts.add({ m, t: 0, puff: 0, done }));
  }

  walk(m, from, to, facing, limping = false) {
    return new Promise((resolve) => {
      const dx = to.x - from.x, dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      const heading = Math.atan2(dy, dx) * 180 / Math.PI;
      m.targetFacing = heading;
      this.sound(() => sfx.servo());
      if (Math.random() < 0.5) this.bark(m, "move");
      const w = { m, from, to, t: 0, dur: Math.max(0.35, dist / (m.weightClass === "medium" ? 5 : 7)) * (limping ? 1.6 : 1), facing, resolve, dust: 0 };
      this.walkers.add(w);
    });
  }

  // A straight-line hop on thrusters: the mech arcs over whatever is in the
  // way and lands in a puff of dust. `drag` slides it along the ground instead
  // (a reeled rig), `height` 0 with drag.
  hop(m, from, to, facing, { height = 3, dur, drag = false, strafe = false } = {}) {
    return new Promise((resolve) => {
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      if (!drag && !strafe && dist > 0.3) m.targetFacing = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
      const w = { m, from, to, t: 0, dur: dur ?? Math.max(0.6, 0.45 + dist * 0.09), facing, resolve, dust: 0, hop: drag ? 0 : height, drag };
      this.walkers.add(w);
    });
  }

  tick(dt) {
    for (const d of this.drops) {
      if ((d.delay -= dt) > 0) continue;
      const m = d.m;
      d.v += 30 * dt;
      m.root.position.y = Math.max(0, m.root.position.y - d.v * dt * 1.2);
      if (Math.random() < 0.6) this.world.fx.particle(m.root.position.clone().add(new THREE.Vector3(0, 0.3, 0)), { color: 0xff9933, size: 0.9, life: 0.35, vel: new THREE.Vector3(0, 6, 0), grow: 1.5 });
      if (m.root.position.y <= 0) {
        this.drops.delete(d);
        this.world.fx.burst(m.root.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 18, { color: 0x9a8a70, size: 0.8, life: 0.8, spread: 5, additive: false, opacity: 0.6, up: 0.3 });
        this.world.fx.shake = Math.max(this.world.fx.shake, 0.35);
        this.sound(() => sfx.step(true));
        d.done?.();
        if (!this.drops.size) setTimeout(() => this.dropDone?.(), 400);
      }
    }
    for (const L of this.lifts) {
      const m = L.m;
      L.t += dt * this.speed;
      const rise = Math.max(0, L.t - 0.45);
      m.root.position.y = rise * rise * 9;
      m.root.rotation.y += dt * Math.min(1.5, rise) * 0.6;
      m.walking = 0;
      L.puff += dt;
      if (L.puff > 0.03) {
        L.puff = 0;
        const at = m.root.position.clone();
        this.world.fx.particle(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.2, (Math.random() - 0.5) * 0.6)), { color: Math.random() < 0.5 ? 0xff9933 : 0xffe07a, size: 1, life: 0.35, vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, -7, (Math.random() - 0.5) * 1.5), grow: 1.8 });
        if (m.root.position.y < 3) this.world.fx.particle(new THREE.Vector3(at.x + (Math.random() - 0.5) * 3, 0.3, at.z + (Math.random() - 0.5) * 3), { color: 0x8a7a60, size: 1, life: 1, grow: 3, additive: false, opacity: 0.45, vel: new THREE.Vector3((Math.random() - 0.5) * 4, 0.6, (Math.random() - 0.5) * 4) });
      }
      if (m.root.position.y > 5) m.setOpacity(Math.max(0, 1 - (m.root.position.y - 5) / 20));
      if (m.root.position.y > 25 || L.t > 3.2) { this.lifts.delete(L); this.removeMech(m.id); L.done(); }
    }
    for (const w of this.walkers) {
      w.t += (dt * this.speed) / w.dur;
      const t = Math.min(1, w.t);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      if (w.hop != null) {
        // Thruster hop / cable drag: its own arc, no stride.
        const y = w.hop * Math.sin(Math.PI * t);
        const k = w.drag ? t * t : t;
        w.m.root.position.set(w.from.x + (w.to.x - w.from.x) * k, y, w.from.y + (w.to.y - w.from.y) * k);
        w.dust += dt;
        if (w.dust > 0.03) {
          w.dust = 0;
          const at = w.m.root.position.clone();
          if (w.hop > 0 && t < 0.92) {
            this.world.fx.particle(at.clone().add(new THREE.Vector3(0, 0.3, 0)), { color: Math.random() < 0.5 ? 0xff9933 : 0xffd27a, size: 0.8, life: 0.3, vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, -5, (Math.random() - 0.5) * 1.5), grow: 1.6 });
            this.world.fx.particle(at.clone(), { color: 0x6a6258, size: 0.6, life: 0.9, grow: 3, additive: false, opacity: 0.35, vel: new THREE.Vector3(0, 0.4, 0) });
          } else if (w.drag) {
            this.world.fx.particle(at.clone().add(new THREE.Vector3(0, 0.2, 0)), { color: 0x8a7a60, size: 0.7, life: 0.7, grow: 2.5, additive: false, opacity: 0.45, vel: new THREE.Vector3(0, 0.6, 0) });
            if (Math.random() < 0.4) this.world.fx.sparks(at.clone().add(new THREE.Vector3(0, 0.2, 0)), 2);
          }
        }
        if (t >= 1) {
          w.m.root.position.y = 0;
          w.m.targetFacing = w.facing;
          if (w.hop > 0) {
            this.world.fx.burst(w.m.root.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 16, { color: 0x9a8a70, size: 0.8, life: 0.8, spread: 5, additive: false, opacity: 0.55, up: 0.3 });
            this.world.fx.shake = Math.max(this.world.fx.shake, 0.3);
            this.sound(() => sfx.land());
          }
          this.walkers.delete(w); w.resolve();
        }
        continue;
      }
      w.m.root.position.set(w.from.x + (w.to.x - w.from.x) * e, 0, w.from.y + (w.to.y - w.from.y) * e);
      w.m.walking = Math.min(1, w.m.walking + dt * 4);
      const stepN = Math.floor(w.m.walkPhase / Math.PI);
      if (stepN !== w.lastStep) { w.lastStep = stepN; this.sound(() => sfx.step(w.m.weightClass === "medium")); }
      w.dust += dt;
      if (w.dust > 0.15) { w.dust = 0; this.world.fx.particle(w.m.root.position.clone().add(new THREE.Vector3(0, 0.2, 0)), { color: 0x8a7a60, size: 0.6, life: 0.8, grow: 2.5, additive: false, opacity: 0.35, vel: new THREE.Vector3(0, 0.5, 0) }); }
      if (t >= 1) { w.m.targetFacing = w.facing; this.walkers.delete(w); w.resolve(); }
    }
    for (const m of this.mechs.values()) {
      if (![...this.walkers].some((w) => w.m === m && w.hop == null)) m.walking = Math.max(0, m.walking - dt * 3);
      m.update(dt);
      // Pop Smoke lingers until the rig's next activation; Harden glints.
      if (m.data?.smoked && !m.destroyed && Math.random() < dt * 5) {
        const a = Math.random() * Math.PI * 2, rr = m.radius * (0.6 + Math.random() * 0.9);
        this.world.fx.particle(m.root.position.clone().add(new THREE.Vector3(Math.cos(a) * rr, 0.6 + Math.random() * 1.2, Math.sin(a) * rr)), { color: 0xb8b4aa, size: 1.3, life: 2.4, grow: 2.2, additive: false, opacity: 0.4, vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.25, (Math.random() - 0.5) * 0.3) });
      }
      if (m.data?.hardened && !m.destroyed && Math.random() < dt * 2.5) {
        const a = Math.random() * Math.PI * 2;
        this.world.fx.particle(m.root.position.clone().add(new THREE.Vector3(Math.cos(a) * m.radius * 0.7, 0.8 + Math.random() * 1.4, Math.sin(a) * m.radius * 0.7)), { color: 0xbfe0ff, size: 0.35, life: 0.35, grow: 0.5 });
      }
      if (m.heatFrac > 1 && !m.destroyed && Math.random() < dt * 6) {
        const s = m.stacks[Math.floor(Math.random() * m.stacks.length)];
        this.world.fx.steam(s.getWorldPosition(new THREE.Vector3()));
      }
      if (m.hurt > 0.45 && !m.destroyed && Math.random() < dt * m.hurt * 3) {
        this.world.fx.smoke(m.root.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 1, true);
      }
      if (m.broken?.engine && !m.destroyed && Math.random() < dt * 3) this.world.fx.smoke(m.stacks[0].getWorldPosition(new THREE.Vector3()), 1, true);
      if (m.destroyed && Math.random() < dt * 2) this.world.fx.smoke(m.root.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 1, true);
    }
  }

  // An area weapon's blast drawn at its true radius (inches = world units).
  splashBlast(pos, splash) {
    const fx = this.world.fx, R = splash.radius;
    const fire = !!splash.heat && !splash.pen;
    const col = fire ? 0xff5a1a : 0xffa040;
    fx.shockwave(pos, R, col, 0.8);
    if (!fire) fx.explosion(pos.clone().setY(1), R >= 2);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
      fx.particle(pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.3, Math.sin(a) * r)), fire
        ? { color: Math.random() < 0.5 ? 0xff7a2a : 0xffc050, size: 0.9, life: 0.9, grow: 1.8, vel: new THREE.Vector3(0, 2 + Math.random() * 2, 0) }
        : { color: 0x5a4a3a, size: 1.2, life: 1.6, grow: 2.5, additive: false, opacity: 0.55, vel: new THREE.Vector3(0, 1.2 + Math.random(), 0) });
    }
    // The footprint: a scorch disc and a bright rim at exactly R, fading out.
    const rim = new THREE.Mesh(new THREE.RingGeometry(R - 0.12, R, 72), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    rim.rotation.x = -Math.PI / 2; rim.position.set(pos.x, 0.08, pos.z);
    fx.timed(rim, 2.6 / this.speed, (k, o) => { o.material.opacity = 0.9 * (1 - k * k); });
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshBasicMaterial({ color: fire ? 0x3a1206 : 0x140e08, transparent: true, opacity: 0.55, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.set(pos.x, 0.05, pos.z);
    fx.timed(scorch, 2.6 / this.speed, (k, o) => { o.material.opacity = 0.55 * (1 - k); });
    fx.text(pos.clone().setY(4.8), `SPLASH ${R}"`, fire ? "#ff8a3a" : "#ffb35a");
    fx.shake = Math.max(fx.shake, fire ? 0.15 : 0.35);
  }

  async event(l, frame, prev) {
    const fx = this.world.fx;
    const actor = this.mechs.get(l.rigId);
    const up = (m, h = 2.5) => m.root.position.clone().add(new THREE.Vector3(0, h, 0));
    if (l.kind === "attack" && actor) {
      const target = this.mechs.get(l.targetId) || this.findTargetByText(l.summary);
      if (!target) return;
      const melee = MELEE_NAMES.has(l.weapon) || actor.melee === l.weapon;
      const tpos = up(target, 1.8);
      this.onCamera({ x: (actor.root.position.x + target.root.position.x) / 2, y: (actor.root.position.z + target.root.position.z) / 2 }, { owner: actor.owner });
      actor.aimAt(target.root.position.clone().setY(2));
      await wait(250 / this.speed);
      if (l.grit) fx.text(up(actor, 3.8), "GRIT!", "#f0cf7a");
      if (this.onDice && !this.skipping && !this.quiet) await this.onDice(l);
      const m = /=\s*(\d+)\s*SP(?: to (\w+))?/.exec(l.summary || "");
      const sp = m ? Number(m[1]) : 0;
      const loc = m?.[2];
      // Which dice actually hit, from the engine's own breakdown. Each visual
      // shot follows one outcome: hits strike the target, misses sail past it.
      const hitStep = l.breakdown?.steps?.find((st) => st.kind === "hit");
      const hitCount = hitStep?.dice ? hitStep.dice.filter((d) => d.ok).length : (sp > 0 ? 1 : 0);
      const diceCount = hitStep?.dice?.length || 1;
      let heard = false;
      const impact = (p) => {
        if (!heard) { heard = true; this.sound(() => sfx.hit(sp)); }
        if (sp > 0) { fx.sparks(p, 10 + sp * 3); fx.flash(p, 0xffaa44, 20 + sp * 8, 8); fx.shake = Math.max(fx.shake, Math.min(0.6, sp * 0.08)); target.body.position.x = -0.2; setTimeout(() => { target.body.position.x = 0; }, 90); }
        else fx.burst(p, 6, { color: 0xbbbbbb, size: 0.3, life: 0.3, spread: 3 }); // struck armour, didn't wound
      };
      // A miss lands on the table beyond / beside the target: dust, no flash.
      const missPoint = (from) => {
        const dir = tpos.clone().sub(from).setY(0).normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random() * 1.6));
        return target.root.position.clone().add(dir.multiplyScalar(3 + Math.random() * 5)).add(side).setY(0.05);
      };
      const whiff = (p) => fx.burst(p, 8, { color: 0x8a7a60, size: 0.6, life: 0.7, spread: 2, additive: false, opacity: 0.5, up: 0.5 });
      if (melee) {
        actor.fire("melee");
        this.sound(() => (actor.melee === "Flamethrower" ? sfx.shot("flame") : sfx.melee(actor.weightClass === "medium")));
        const aim = hitCount ? tpos : missPoint(actor.root.position.clone().setY(1.8)).setY(1.2);
        if (actor.melee === "Flamethrower") fx.flame(actor.muzzleWorld("melee"), aim);
        await wait(380 / this.speed);
        if (hitCount) impact(tpos);   // a whiffed swing just cuts air
      } else {
        const kind = PROJECTILE[l.weapon] || "bullet";
        const n = BURST[l.weapon] || 1;
        // Spread the real hit ratio over the visual shots (at least one if any die hit).
        let hitsLeft = hitCount ? Math.max(1, Math.round((n * hitCount) / diceCount)) : 0;
        const plan = Array.from({ length: n }, () => false).map((_, i) => i < hitsLeft).sort(() => Math.random() - 0.5);
        const flights = [];
        for (let i = 0; i < n; i++) {
          actor.fire("longRange");
          this.sound(() => sfx.shot(kind));
          const from = actor.muzzleWorld("longRange");
          fx.muzzle(from, kind === "arc" ? 0x66ccff : 0xffcc55);
          const hit = plan[i];
          const end = hit ? tpos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6)) : missPoint(from);
          const land = (p) => {
            if (hit) impact(p); else whiff(p);
            if (kind === "lob" || kind === "missile") { fx.explosion(p, false); this.sound(() => sfx.explosion(false)); }
          };
          if (kind === "arc") { fx.beam(from, end, 0x88ddff, 0.35, true); fx.beam(from, end, 0xffffff, 0.2, true); land(end); }
          else flights.push(new Promise((res) => fx.shoot(from, end, kind, (p) => { land(p); res(); })));
          await wait((n > 1 ? 90 : 60) / this.speed);
        }
        await Promise.all(flights);
      }
      // Point-Defense interceptors / Ablative Cascade charges spent on this attack.
      const said = `${l.summary || ""} ${(l.effects || []).join(" ")}`;
      const pd = l.defense?.pd || (/Point-Defense|intercept/i.test(said) ? 1 : 0);
      const abl = l.defense?.ablative || (/Ablative Cascade/i.test(said) ? 1 : 0);
      if (pd || abl) {
        this.sound(() => sfx.intercept());
        const face = tpos.clone().lerp(actor.root.position.clone().setY(1.8), Math.min(0.5, 2 / Math.max(1, tpos.distanceTo(actor.root.position))));
        if (pd) { fx.sparks(face, 16, 0x9fe8ff); fx.flash(face, 0x9fe8ff, 30, 6); fx.text(up(target, 4.4), pd > 1 ? `INTERCEPTED ×${pd}` : "INTERCEPTED", "#9fe8ff"); }
        if (abl) { fx.sparks(tpos, 14, 0xcfe6ff); fx.shell(target.root.position.clone(), target.radius * 1.05, 3.2, 0x9fc8ff, 0.6, 1); fx.text(up(target, pd ? 5.2 : 4.4), abl > 1 ? `ABLATIVE ×${abl}` : "ABLATIVE", "#bfe0ff"); }
      }
      fx.text(up(target, 3.4), sp > 0 ? `-${sp} ${loc ? loc.toUpperCase() : "SP"}` : hitCount ? "DEFLECTED" : "MISS", sp > 0 ? "#ffcf4a" : "#bbbbbb");
      // Stagger: a shot that did no damage still rattles the target.
      if (l.stagger) {
        setTimeout(() => fx.text(up(target, 4.4), "STAGGERED", "#b58cff"), 300 / this.speed);
        this.sound(() => sfx.stagger());
        target.body.rotation.z = 0.25; setTimeout(() => { target.body.rotation.z = -0.12; }, 120); setTimeout(() => { target.body.rotation.z = 0; }, 260);
      }
      // Area weapons: the blast fills its real splash radius, shockwave out to
      // the rim, and a scorch ring that lingers so you can read the area.
      const splash = (WEAPONS.longRange[l.weapon] || WEAPONS.melee[l.weapon])?.splash;
      if (splash) this.splashBlast(target.root.position.clone(), splash);
      const tr = frame.rigs.find((r) => r.id === target.id), trPrev = prev.rigs.find((r) => r.id === target.id);
      if (tr && trPrev && !tr.destroyed && loc) this.announceBreak(tr, trPrev, loc);
      const killed = frame.rigs.find((r) => r.id === target.id)?.destroyed && !target.destroyed;
      if (killed) { this.bark(actor, "kill", { other: target }); setTimeout(() => this.bark(target, "die", { other: actor }), 350); }
      else if (sp >= 3) { if (Math.random() < 0.5) this.bark(actor, "hit", { other: target, part: loc }); else this.bark(target, "hurt", { other: actor, part: loc }); }
      else this.bark(actor, sp > 0 ? "hit" : "miss", { other: target, part: sp > 0 ? loc : null });
      await wait(350 / this.speed);
      actor.aimAt(null);
    } else if (l.kind === "overheat" && actor) {
      if (this.onDice && !this.skipping && !this.quiet) this.onDice(l);
      for (let i = 0; i < 14; i++) fx.steam(up(actor, 2.6));
      const bad = !/Nothing happens/.test(l.summary || "");
      this.sound(() => sfx.overheat(bad));
      if (bad) this.bark(actor, "heat");
      if (bad) { fx.sparks(up(actor, 2), 16); fx.flash(up(actor), 0xff4400, 40, 8); }
      fx.text(up(actor, 3.6), bad ? (l.summary.split(":")[1] || "OVERHEAT").split("(")[0].trim().toUpperCase() : "HEAT OK", bad ? "#ff6a3d" : "#9ee29e");
      await wait(500 / this.speed);
    } else if (l.kind === "destruction") {
      // The explosion is the status pass's (on the destroyed flag); the kill's VP is shown here.
      if (l.vp?.amount && actor) {
        setTimeout(() => fx.text(up(actor, 4.6), `+${l.vp.amount} VP${l.vp.bounty ? " BOUNTY" : ""}`, l.vp.side === "a" ? "#5fd3c0" : "#e0533d"), 900 / this.speed);
        this.onScore(l);
      }
    } else if (l.kind === "score") {
      // Round-end beacon payout: the beacon flares in the scorer's colour.
      const at = new THREE.Vector3(l.x ?? 0, 4.2, l.y ?? 0);
      if (l.contested) fx.text(at, "CONTESTED", "#ffffff");
      else {
        const col = l.side === "a" ? 0x5fd3c0 : 0xe0533d;
        this.world.pulseObjective(l.objective, col);
        fx.text(at, (l.mult || 1) > 1 ? `+${l.vp} VP (×${l.mult})` : `+${l.vp} VP`, l.side === "a" ? "#5fd3c0" : "#e0533d");
        this.sound(() => sfx.score(l.side === this.side));
        this.onCamera({ x: l.x, y: l.y }, { owner: l.side, score: true });
        this.onScore(l);
      }
      await wait(650 / this.speed);
    } else if (l.kind === "crate") {
      // Salvage Run: the crate is hauled off: a golden burst and the VP.
      const at = new THREE.Vector3(l.x ?? 0, 1.1, l.y ?? 0);
      const tint = l.side === "a" ? 0x5fd3c0 : 0xe0533d;
      this.onCamera({ x: l.x, y: l.y }, { owner: l.side, score: true });
      this.world.claimCrate(l.x, l.y);
      fx.flash(at, 0xffd35a, 45, 9);
      fx.burst(at, 28, { color: 0xffd35a, size: 0.55, life: 0.9, spread: 6, up: 1.2 });
      fx.burst(at, 12, { color: tint, size: 0.7, life: 0.7, spread: 4, up: 1 });
      fx.text(at.clone().setY(3.4), `+${l.vp} VP`, l.side === "a" ? "#5fd3c0" : "#e0533d");
      setTimeout(() => fx.text(at.clone().setY(4.4), "SALVAGE", "#f0cf7a"), 200 / this.speed);
      this.sound(() => sfx.score(l.side === this.side));
      this.onScore(l);
      await wait(700 / this.speed);
    } else if (l.kind === "extract" && actor) {
      // Breakthrough: the rig lifts off out of the enemy corner.
      this.onCamera({ x: actor.root.position.x, y: actor.root.position.z }, { owner: actor.owner, score: true });
      fx.text(up(actor, 3.8), "EXTRACTED", "#4fffc8");
      fx.shell(actor.root.position.clone(), actor.radius * 1.1, 3.4, 0x4fffc8, 0.9, 2);
      this.sound(() => sfx.liftoff());
      this.onBanner(`${actor.name} BROKE THROUGH`, "turn");
      await this.liftOff(actor);
      this.sound(() => sfx.score(actor.owner === this.side));
    } else if (l.kind === "reinforcement") {
      const m = this.mechs.get(l.rigId);
      this.onBanner("Enemy reinforcements!", "stinger");
      this.sound(() => sfx.alarm());
      if (m?.pendingDrop) {
        await this.dropOne(m, frame.rigs.find((r) => r.id === l.rigId));
        fx.text(up(m, 3.8), "REINFORCEMENTS", "#ff7a5a");
      }
    } else if (l.kind === "blast") {
      const t = this.mechs.get(l.rigId);
      if (t) { fx.explosion(up(t, 1), false); this.sound(() => sfx.explosion(false)); }
      await wait(250 / this.speed);
    } else if (l.kind === "splash") {
      // Area weapon spill: a small blast (or a gout of flame) on each rig caught.
      const t = this.mechs.get(l.rigId);
      if (t) {
        const flame = /heat/.test(l.summary || "") && !/SP to/.test(l.summary || "");
        if (flame) fx.burst(up(t, 1), 18, { color: 0xff6a22, size: 0.8, life: 0.5, spread: 3 }); else fx.explosion(up(t, 1), false);
        fx.text(up(t, 3.4), /friendly fire/.test(l.summary || "") ? "FRIENDLY FIRE" : "SPLASH", "#ffb35a");
        this.sound(() => sfx.explosion(false));
      }
      await wait(220 / this.speed);
    } else if (l.kind === "grit") {
      // The side that's behind digs in: a Grit token arrives.
      this.onBanner(`GRIT · ${l.side === this.side ? "YOU DIG IN" : "THE ENEMY DIGS IN"}`, "grit");
      this.sound(() => sfx.score(l.side === this.side));
      await wait(400 / this.speed);
    } else if (l.kind === "initiative") {
      this.onBanner(l.summary, "info");
    } else if (l.kind === "equipment" && actor && equipmentActiveOf(l)) {
      await this.equipmentFx(l, equipmentActiveOf(l), actor, frame, prev);
    } else if (actor && (l.chaff || (l.kind === "perk" && /Chaff Burst/i.test(l.summary || "")))) {
      await this.chaffFx(l, actor, frame, prev);
    } else if (actor && l.summary) {
      if (l.rolls?.length && l.kind === "reaction" && this.onDice && !this.skipping && !this.quiet) this.onDice(l);
      // Preparations, reactions, equipment, reloads… a short tag over the rig.
      const short = { prepare: "PREPARED", reload: "RELOAD", repair: "REPAIR", reaction: "REACTION!", equipment: "SYSTEM", lock: "LOCK", emplace: "EMPLACED", barrage: "BARRAGE", shutdown: "SHUT DOWN", perk: null }[l.kind];
      if (short) fx.text(up(actor, 3.4), l.improved && short === "REACTION!" ? "IMPROVED REACTION!" : short, l.improved ? "#f0cf7a" : "#9fd8ff");
      if (l.kind === "barrage") fx.explosion(up(actor, 1.5), false);
      await wait(150 / this.speed);
    }
  }

  // Where a rig stood before this frame and where it ends up.
  endpoints(id, frame, prev) {
    const a = prev?.rigs.find((r) => r.id === id), b = frame?.rigs.find((r) => r.id === id);
    return { from: a?.pos || b?.pos, to: b?.pos || a?.pos, facing: b?.facing ?? a?.facing ?? 0 };
  }

  // Per-active show for an equipment resolution (Harden shimmer, Purge steam,
  // thruster hops, grapnel cable, Overclock pulse, welding sparks, heat rings…).
  async equipmentFx(l, act, m, frame, prev) {
    const fx = this.world.fx;
    const up = (mm, h = 2.5) => mm.root.position.clone().add(new THREE.Vector3(0, h, 0));
    const base = (mm) => mm.root.position.clone();
    const tag = (text, color = "#9fd8ff", mm = m) => fx.text(up(mm, 3.6), text, color);
    const victims = (l.victims || []).map((id) => this.mechs.get(id)).filter(Boolean);
    const stacks = () => m.stacks.map((s) => s.getWorldPosition(new THREE.Vector3()));
    const W = (ms) => wait(ms / this.speed);
    const n = Number(l.n ?? /(\d+)/.exec(l.summary || "")?.[1] ?? 0) || 0;
    this.onCamera({ x: m.root.position.x, y: m.root.position.z }, { owner: m.owner });
    switch (act) {
      case "harden": {
        this.sound(() => sfx.clank());
        fx.shell(base(m), m.radius * 1.05, 3.4, 0x9fc8ff, 0.9, 2);
        fx.sparks(up(m, 1.8), 14, 0xcfe6ff);
        m.body.position.y = -0.15; setTimeout(() => { m.body.position.y = 0; }, 120);
        tag("HARDENED", "#bfe0ff");
        await W(500);
        break;
      }
      case "purge": {
        this.sound(() => sfx.hiss(true));
        for (let i = 0; i < 26; i++) setTimeout(() => { for (const p of stacks()) fx.steam(p); fx.particle(up(m, 1.4), { color: 0xeeeeee, size: 0.5, life: 0.9, grow: 3.5, additive: false, opacity: 0.4, vel: new THREE.Vector3((Math.random() - 0.5) * 6, 1 + Math.random(), (Math.random() - 0.5) * 6) }); }, i * 35);
        tag("PURGE", "#cfefff");
        await W(600);
        break;
      }
      case "jumpjets": {
        const { from, to, facing } = this.endpoints(m.id, frame, prev);
        const f = l.from || from, t = l.to || to;
        this.sound(() => sfx.jet());
        tag("JUMP JETS", "#ffd27a");
        fx.burst(base(m).add(new THREE.Vector3(0, 0.3, 0)), 14, { color: 0x9a8a70, size: 0.8, life: 0.7, spread: 4, additive: false, opacity: 0.5, up: 0.3 });
        if (f && t) await this.hop(m, f, t, facing, { height: 3.2 });
        break;
      }
      case "grapnel": {
        this.sound(() => sfx.grapnel());
        tag("GRAPNEL", "#e0c080");
        if (isReel(l)) {
          const v = victims[0] || this.mechs.get(l.targetId);
          if (v) {
            m.aimAt(v.root.position.clone().setY(2));
            m.fire("longRange");
            fx.tether(() => m.muzzleWorld("longRange"), () => up(v, 1.6), 0x9a8a60, 1.4);
            await W(250);
            fx.sparks(up(v, 1.6), 10);
            const { from, to, facing } = this.endpoints(v.id, frame, prev);
            if (from && to) await this.hop(v, from, to, facing, { drag: true, dur: 0.7 });
            fx.text(up(v, 3.6), "REELED IN", "#e0c080");
            m.aimAt(null);
          }
        } else {
          const { from, to, facing } = this.endpoints(m.id, frame, prev);
          const f = l.from || from, t = l.to || to;
          if (f && t) {
            const anchor = new THREE.Vector3(t.x + (t.x - f.x) * 0.15, 0.2, t.y + (t.y - f.y) * 0.15);
            fx.tether(() => up(m, 1.6), () => anchor, 0x9a8a60, 1.2);
            fx.sparks(anchor.clone().setY(0.4), 8);
            await W(200);
            this.sound(() => sfx.jet());
            await this.hop(m, f, t, facing, { height: 2.4, dur: 0.6 });
          }
        }
        break;
      }
      case "overclock": {
        this.sound(() => sfx.overclock());
        fx.shell(base(m), m.radius * 1.1, 3.2, 0xff3a24, 1.1, 3);
        fx.flash(up(m, 1.8), 0xff2a10, 50, 10);
        for (const p of stacks()) fx.sparks(p, 12, 0xff8a4a);
        tag("OVERCLOCK", "#ff6a4a");
        await W(550);
        break;
      }
      case "emergencypatch": {
        this.sound(() => sfx.weld());
        for (let i = 0; i < 4; i++) setTimeout(() => fx.weld(up(m, 1 + Math.random() * 1.2).add(new THREE.Vector3((Math.random() - 0.5) * m.radius, 0, (Math.random() - 0.5) * m.radius))), i * 110);
        tag("PATCHED", "#8dff7a");
        await W(550);
        break;
      }
      case "nanite": {
        const host = this.mechs.get(l.targetId) || victims[0] || this.findHostByText(l.summary) || m;
        this.sound(() => sfx.weld());
        if (host !== m) fx.beam(up(m, 1.8), up(host, 1.6), 0x7fff6a, 0.6, true);
        for (let i = 0; i < 24; i++) setTimeout(() => {
          const a = Math.random() * Math.PI * 2;
          fx.particle(base(host).add(new THREE.Vector3(Math.cos(a) * host.radius, 0.3, Math.sin(a) * host.radius)), { color: 0x7fff6a, size: 0.25, life: 1.1, vel: new THREE.Vector3(-Math.cos(a) * 0.6, 1.6, -Math.sin(a) * 0.6) });
        }, i * 25);
        fx.weld(up(host, 1.5), 10);
        fx.text(up(host, 3.6), "NANITES", "#8dff7a");
        await W(600);
        break;
      }
      case "heatpurgewave": {
        this.sound(() => sfx.wave(false));
        this.sound(() => sfx.hiss(true));
        for (const p of stacks()) for (let i = 0; i < 6; i++) fx.steam(p);
        fx.shockwave(base(m), m.radius + 3, 0xff7a2a, 0.8);
        tag("HEAT PURGE WAVE", "#ffae5a");
        await W(420);
        for (const v of victims) {
          fx.burst(up(v, 1.4), 18, { color: 0xff6a1a, size: 0.7, life: 0.6, spread: 3 });
          for (let i = 0; i < 6; i++) fx.steam(up(v, 2));
          fx.text(up(v, 3.4), "SCALDED +2 HEAT", "#ff8a3d");
        }
        await W(450);
        break;
      }
      case "meltdown": {
        const burst = l.mode === "burst" || (l.mode == null && (victims.length > 0 || /burst/i.test(l.summary || "")));
        if (burst) {
          this.sound(() => sfx.wave(true));
          fx.flash(up(m, 1.5), 0xff5a10, 120, 20);
          fx.shockwave(base(m), m.radius + 4, 0xff5a10, 1.1);
          fx.burst(up(m, 1.5), 30, { color: 0xff8a2a, size: 0.8, life: 0.6, spread: 6 });
          fx.shake = Math.max(fx.shake, 0.5);
          tag("MELTDOWN BURST", "#ff7a2a");
          await W(500);
          for (const v of victims) { fx.burst(up(v, 1.4), 16, { color: 0xff5a10, size: 0.7, life: 0.6, spread: 3 }); fx.text(up(v, 3.4), n ? `+${n} HEAT` : "HEAT", "#ff8a3d"); }
          await W(350);
        } else {
          this.sound(() => sfx.overclock());
          fx.shell(base(m), m.radius * 1.1, 3.2, 0xff7a1a, 0.9, 2);
          tag(n ? `OVERLOAD +${n} PEN` : "OVERLOAD", "#ff9a3d");
          await W(450);
        }
        break;
      }
      case "meltdown-bank": {
        fx.shell(base(m), m.radius, 2.6, 0xff5a10, 0.8, 1);
        tag(n ? `MELTDOWN +${n}` : "MELTDOWN CHARGE", "#ff7a2a");
        await W(300);
        break;
      }
      case "locksight": {
        this.sound(() => sfx.lockon());
        fx.reticle(up(m, 1.9), "#ff5a3c", 1.2);
        tag("LOCK SIGHT", "#ff8a6a");
        await W(500);
        break;
      }
      case "popsmoke": {
        this.sound(() => sfx.smoke());
        for (let i = 0; i < 3; i++) fx.shoot(up(m, 2.2), up(m, 0).add(new THREE.Vector3((Math.random() - 0.5) * 5, 0.3, (Math.random() - 0.5) * 5)), "lob", (p) => fx.burst(p, 8, { color: 0xc8c4ba, size: 1.2, life: 2.2, spread: 2.5, additive: false, opacity: 0.5, up: 0.5 }));
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2, rr = Math.random() * m.radius * 2.2;
          fx.particle(base(m).add(new THREE.Vector3(Math.cos(a) * rr, 0.4 + Math.random() * 2, Math.sin(a) * rr)), { color: 0xb8b4aa, size: 1.6, life: 2.5 + Math.random() * 1.5, grow: 2.2, additive: false, opacity: 0.5, vel: new THREE.Vector3(Math.cos(a) * 0.8, 0.3, Math.sin(a) * 0.8) });
        }
        tag("SMOKE", "#d8d4c8");
        await W(500);
        break;
      }
      case "cryo": {
        this.sound(() => sfx.cryo());
        for (const p of stacks()) fx.frost(p, 12);
        fx.frost(up(m, 1.2), 10);
        tag(n ? `CRYO −${2 * n} HEAT` : "CRYO", "#bfeaff");
        await W(500);
        break;
      }
      default: {
        tag("SYSTEM");
        await W(150);
      }
    }
  }

  // Chaff Burst: the smoked rig side-steps out of the shot in a glitter of foil.
  async chaffFx(l, m, frame, prev) {
    const fx = this.world.fx;
    const { from, to, facing } = this.endpoints(m.id, frame, prev);
    const f = l.chaff?.from || from, t = l.chaff?.to || to;
    this.sound(() => sfx.chaff());
    fx.glitter(m.root.position.clone().add(new THREE.Vector3(0, 1.8, 0)));
    fx.text(m.root.position.clone().add(new THREE.Vector3(0, 3.6, 0)), "CHAFF", "#e8e8f0");
    if (f && t && Math.hypot(t.x - f.x, t.y - f.y) > 0.05) await this.hop(m, f, t, facing, { height: 0.5, dur: 0.4, strafe: true });
    else await wait(250 / this.speed);
    // Hold the pose: a sidestep is a strafe, not a turn.
    m.targetFacing = facing;
  }

  findHostByText(summary = "") {
    const mm = /on (.+?)'s /.exec(summary);
    if (!mm) return null;
    for (const mech of this.mechs.values()) if (mech.name === mm[1]) return mech;
    return null;
  }

  // A part just hit 0: a stinger banner, a red tag over the rig, a crunch.
  announceBreak(r, prev, loc) {
    const key = `${r.id}:${loc}`;
    if (this.announced?.has(key)) return;
    const now = r.sp?.[loc], was = prev.sp?.[loc];
    if (!now || !was || !(now[1] > 0) || !(was[0] > 0) || now[0] > 0) return;
    this.announced?.add(key);
    const m = this.mechs.get(r.id);
    const text = { arms: "ARM TORN OFF", legs: "LEGS CRIPPLED", engine: "ENGINE STALLED", hull: "HULL BREACHED" }[loc] || `${loc.toUpperCase()} BROKEN`;
    if (m) {
      this.world.fx.text(m.root.position.clone().add(new THREE.Vector3(0, 5, 0)), text, "#ff5a3c");
      this.world.fx.sparks(m.root.position.clone().add(new THREE.Vector3(0, 2, 0)), 30);
      this.onCamera({ x: m.root.position.x, y: m.root.position.z }, { punch: true, owner: r.owner });
    }
    this.onBanner(`${r.name}: ${text}`, "stinger");
    this.sound(() => sfx.breakPart());
  }

  findTargetByText(summary = "") {
    const m = /→\s*(.+?)\s+with/.exec(summary);
    if (!m) return null;
    for (const mech of this.mechs.values()) if (mech.name === m[1]) return mech;
    return null;
  }
}
