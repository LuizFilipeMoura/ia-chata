// The Director turns engine state into a show. It owns one Mech per rig and
// plays frames — { rigs, log, cmd, round, … } snapshots, from a live push, a bot
// turn, or a GA replay — as animation: walks along routed paths, per-weapon
// projectiles, impact sparks + damage numbers, cook-offs, overheat steam. Frames
// queue, so a whole bot turn plays out move by move.
import * as THREE from "three";
import { Mech } from "../scene/mechs.js";
import { CHASSIS, LOCS } from "/shared/game-state.js";
import { HEAT_CAPACITY } from "/shared/rules.js";
import { BASE_RADIUS } from "/shared/geometry.js";

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
      sp: Object.fromEntries(LOCS.map((l) => [l, r[l] ? [r[l].sp, r[l].max] : [0, 0]])),
    })),
    log: (g.resolutions || []).filter((x) => x.id > sinceResolutionId),
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Director {
  constructor(world, { onLog, onBanner } = {}) {
    this.world = world;
    this.mechs = new Map();
    this.onLog = onLog || (() => {});
    this.onBanner = onBanner || (() => {});
    this.speed = 1;
    this.queue = Promise.resolve();
    this.current = null;
    this.busy = 0;
    this.walkers = new Set();
    world.tickers.add((dt) => this.tick(dt));
  }

  get idle() { return this.busy === 0; }

  reset() {
    for (const m of this.mechs.values()) this.world.scene.remove(m.root);
    this.mechs.clear();
    this.current = null;
    this.world.mechRoots = [];
  }

  ensureMech(r) {
    let m = this.mechs.get(r.id);
    if (m) return m;
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

  // Snap to a frame with no animation (initial load, replay scrubbing).
  snap(frame) {
    for (const r of frame.rigs) {
      const m = this.ensureMech(r);
      if (r.pos) m.setPose(r.pos, r.facing);
      this.applyStatus(m, r);
      if (r.destroyed && !m.destroyed) m.destroy();
    }
    this.current = frame;
  }

  applyStatus(m, r) {
    const cap = HEAT_CAPACITY[m.weightClass] ?? 6;
    m.setHeat(r.heat / cap);
    const tot = LOCS.reduce((a, l) => a + (r.sp[l]?.[0] || 0), 0), max = LOCS.reduce((a, l) => a + (r.sp[l]?.[1] || 0), 0);
    m.setHurt(max ? 1 - tot / max : 0);
    m.data = r;
  }

  // Queue a frame for animated playback. Returns when it has finished playing.
  play(frame) {
    this.busy++;
    this.queue = this.queue.then(() => this.animate(frame)).catch((e) => console.error(e)).finally(() => { this.busy--; });
    return this.queue;
  }

  async animate(frame) {
    const prev = this.current;
    if (!prev) { this.snap(frame); frame.log?.forEach((l) => this.onLog(l)); return; }
    const byId = new Map(prev.rigs.map((r) => [r.id, r]));
    if (frame.round !== prev.round && frame.round) this.onBanner(`Round ${frame.round}`, "round");

    // 1. Movement.
    const walks = [];
    for (const r of frame.rigs) {
      const m = this.ensureMech(r);
      const p = byId.get(r.id);
      if (r.pos && p?.pos && (Math.hypot(r.pos.x - p.pos.x, r.pos.y - p.pos.y) > 0.05)) walks.push(this.walk(m, p.pos, r.pos, r.facing));
      else if (r.pos && p && Math.abs(((r.facing - p.facing + 540) % 360) - 180) > 1) { m.targetFacing = r.facing; }
    }
    if (walks.length) await Promise.all(walks);

    // 2. Events.
    for (const l of frame.log || []) {
      this.onLog(l);
      await this.event(l, frame, prev);
    }

    // 3. Status.
    for (const r of frame.rigs) {
      const m = this.ensureMech(r);
      if (r.pos && !this.walkers.size) m.setPose(r.pos, r.facing);
      this.applyStatus(m, r);
      if (r.destroyed && !m.destroyed) {
        this.world.fx.explosion(m.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)), true);
        m.destroy();
        await wait(500 / this.speed);
      }
    }
    this.current = frame;
    await wait(120 / this.speed);
  }

  walk(m, from, to, facing) {
    return new Promise((resolve) => {
      const dx = to.x - from.x, dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      const heading = Math.atan2(dy, dx) * 180 / Math.PI;
      m.targetFacing = heading;
      const w = { m, from, to, t: 0, dur: Math.max(0.35, dist / (m.weightClass === "medium" ? 5 : 7)), facing, resolve, dust: 0 };
      this.walkers.add(w);
    });
  }

  tick(dt) {
    for (const w of this.walkers) {
      w.t += (dt * this.speed) / w.dur;
      const t = Math.min(1, w.t);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      w.m.root.position.set(w.from.x + (w.to.x - w.from.x) * e, 0, w.from.y + (w.to.y - w.from.y) * e);
      w.m.walking = Math.min(1, w.m.walking + dt * 4);
      w.dust += dt;
      if (w.dust > 0.15) { w.dust = 0; this.world.fx.particle(w.m.root.position.clone().add(new THREE.Vector3(0, 0.2, 0)), { color: 0x8a7a60, size: 0.6, life: 0.8, grow: 2.5, additive: false, opacity: 0.35, vel: new THREE.Vector3(0, 0.5, 0) }); }
      if (t >= 1) { w.m.targetFacing = w.facing; this.walkers.delete(w); w.resolve(); }
    }
    for (const m of this.mechs.values()) {
      if (![...this.walkers].some((w) => w.m === m)) m.walking = Math.max(0, m.walking - dt * 3);
      m.update(dt);
      if (m.heatFrac > 1 && !m.destroyed && Math.random() < dt * 6) {
        const s = m.stacks[Math.floor(Math.random() * m.stacks.length)];
        this.world.fx.steam(s.getWorldPosition(new THREE.Vector3()));
      }
      if (m.hurt > 0.45 && !m.destroyed && Math.random() < dt * m.hurt * 3) {
        this.world.fx.smoke(m.root.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 1, true);
      }
      if (m.destroyed && Math.random() < dt * 2) this.world.fx.smoke(m.root.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 1, true);
    }
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
      actor.aimAt(target.root.position.clone().setY(2));
      await wait(250 / this.speed);
      const m = /=\s*(\d+)\s*SP(?: to (\w+))?/.exec(l.summary || "");
      const sp = m ? Number(m[1]) : 0;
      const loc = m?.[2];
      const impact = (p) => {
        if (sp > 0) { fx.sparks(p, 10 + sp * 3); fx.flash(p, 0xffaa44, 20 + sp * 8, 8); fx.shake = Math.max(fx.shake, Math.min(0.6, sp * 0.08)); target.body.position.x = -0.2; setTimeout(() => { target.body.position.x = 0; }, 90); }
        else fx.burst(p, 4, { color: 0xaaaaaa, size: 0.3, life: 0.3, spread: 2 });
      };
      if (melee) {
        actor.fire("melee");
        if (actor.melee === "Flamethrower") fx.flame(actor.muzzleWorld("melee"), tpos);
        await wait(380 / this.speed);
        impact(tpos);
      } else {
        const kind = PROJECTILE[l.weapon] || "bullet";
        const n = BURST[l.weapon] || 1;
        const hits = [];
        for (let i = 0; i < n; i++) {
          actor.fire("longRange");
          const from = actor.muzzleWorld("longRange");
          fx.muzzle(from, kind === "arc" ? 0x66ccff : 0xffcc55);
          const jitter = tpos.clone().add(new THREE.Vector3((Math.random() - 0.5) * (sp ? 0.6 : 3), (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * (sp ? 0.6 : 3)));
          if (kind === "arc") { fx.beam(from, jitter, 0x88ddff, 0.35, true); fx.beam(from, jitter, 0xffffff, 0.2, true); impact(jitter); }
          else hits.push(new Promise((res) => fx.shoot(from, jitter, kind, (p) => { impact(p); if (kind === "lob" || kind === "missile") fx.explosion(p, false); res(); })));
          await wait((n > 1 ? 90 : 60) / this.speed);
        }
        await Promise.all(hits);
      }
      fx.text(up(target, 3.4), sp > 0 ? `-${sp} ${loc ? loc.toUpperCase() : "SP"}` : "MISS", sp > 0 ? "#ffcf4a" : "#bbbbbb");
      await wait(350 / this.speed);
      actor.aimAt(null);
    } else if (l.kind === "overheat" && actor) {
      for (let i = 0; i < 14; i++) fx.steam(up(actor, 2.6));
      const bad = !/Nothing happens/.test(l.summary || "");
      if (bad) { fx.sparks(up(actor, 2), 16); fx.flash(up(actor), 0xff4400, 40, 8); }
      fx.text(up(actor, 3.6), bad ? (l.summary.split(":")[1] || "OVERHEAT").split("(")[0].trim().toUpperCase() : "HEAT OK", bad ? "#ff6a3d" : "#9ee29e");
      await wait(500 / this.speed);
    } else if (l.kind === "destruction") {
      // handled by status pass (explosion on destroyed flag)
    } else if (l.kind === "blast") {
      const t = this.mechs.get(l.rigId);
      if (t) fx.explosion(up(t, 1), false);
      await wait(250 / this.speed);
    } else if (l.kind === "initiative") {
      this.onBanner(l.summary, "info");
    } else if (actor && l.summary) {
      // Preparations, reactions, equipment, reloads… a short tag over the rig.
      const short = { prepare: "PREPARED", reload: "RELOAD", repair: "REPAIR", reaction: "REACTION!", equipment: "SYSTEM", lock: "LOCK", emplace: "EMPLACED", barrage: "BARRAGE", shutdown: "SHUT DOWN", perk: null }[l.kind];
      if (short) fx.text(up(actor, 3.4), short, "#9fd8ff");
      if (l.kind === "barrage") fx.explosion(up(actor, 1.5), false);
      await wait(150 / this.speed);
    }
  }

  findTargetByText(summary = "") {
    const m = /→\s*(.+?)\s+with/.exec(summary);
    if (!m) return null;
    for (const mech of this.mechs.values()) if (mech.name === m[1]) return mech;
    return null;
  }
}
