// The Director turns engine state into a show. It owns one Mech per rig and
// plays frames, { rigs, log, cmd, round, … } snapshots, from a live push, a bot
// turn, or a GA replay, as animation: walks along routed paths, per-weapon
// projectiles, impact sparks + damage numbers, cook-offs, overheat steam. Frames
// queue, so a whole bot turn plays out move by move.
import * as THREE from "three";
import { Mech } from "../scene/mechs.js";
import { CHASSIS, LOCS } from "/shared/game-state.js";
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
      sp: Object.fromEntries(LOCS.map((l) => [l, r[l] ? [r[l].sp, r[l].max] : [0, 0]])),
    })),
    log: (g.resolutions || []).filter((x) => x.id > sinceResolutionId),
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
    this.drops.clear();
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
    m.setParts?.(Object.fromEntries(LOCS.map((l) => [l, (r.sp[l]?.[1] || 0) > 0 && (r.sp[l]?.[0] || 0) <= 0])));
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

  bark(m, event) {
    if (this.quiet || this.skipping || !m || !settings.get("barks")) return;
    const line = barkFor(m.name, event);
    if (!line) return;
    this.world.fx.bubble(m.root.position.clone().add(new THREE.Vector3(0, 3.4, 0)), line, m.owner === "a" ? "#5fd3c0" : "#e0533d");
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
      frame.log?.forEach((l) => this.onLog(l, frame.round));
      for (const r of frame.rigs) { const m = this.mechs.get(r.id); if (r.destroyed && m && !m.destroyed) m.destroy(); }
      return;
    }
    const byId = new Map(prev.rigs.map((r) => [r.id, r]));
    this.announced = new Set();
    if (frame.round !== prev.round && frame.round) this.onBanner(`Round ${frame.round}`, "round");

    // 1. Movement.
    const walks = [];
    for (const r of frame.rigs) {
      const m = this.ensureMech(r);
      const p = byId.get(r.id);
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
    this.current = frame;
    await wait(120 / this.speed);
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
        if (!this.drops.size) setTimeout(() => this.dropDone?.(), 400);
      }
    }
    for (const w of this.walkers) {
      w.t += (dt * this.speed) / w.dur;
      const t = Math.min(1, w.t);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      w.m.root.position.set(w.from.x + (w.to.x - w.from.x) * e, 0, w.from.y + (w.to.y - w.from.y) * e);
      w.m.walking = Math.min(1, w.m.walking + dt * 4);
      const stepN = Math.floor(w.m.walkPhase / Math.PI);
      if (stepN !== w.lastStep) { w.lastStep = stepN; this.sound(() => sfx.step(w.m.weightClass === "medium")); }
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
      if (m.broken?.engine && !m.destroyed && Math.random() < dt * 3) this.world.fx.smoke(m.stacks[0].getWorldPosition(new THREE.Vector3()), 1, true);
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
      this.onCamera({ x: (actor.root.position.x + target.root.position.x) / 2, y: (actor.root.position.z + target.root.position.z) / 2 }, { owner: actor.owner });
      actor.aimAt(target.root.position.clone().setY(2));
      await wait(250 / this.speed);
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
      fx.text(up(target, 3.4), sp > 0 ? `-${sp} ${loc ? loc.toUpperCase() : "SP"}` : hitCount ? "DEFLECTED" : "MISS", sp > 0 ? "#ffcf4a" : "#bbbbbb");
      // Stagger: a shot that did no damage still rattles the target.
      if (l.stagger) {
        setTimeout(() => fx.text(up(target, 4.4), "STAGGERED", "#b58cff"), 300 / this.speed);
        this.sound(() => sfx.stagger());
        target.body.rotation.z = 0.25; setTimeout(() => { target.body.rotation.z = -0.12; }, 120); setTimeout(() => { target.body.rotation.z = 0; }, 260);
      }
      const tr = frame.rigs.find((r) => r.id === target.id), trPrev = prev.rigs.find((r) => r.id === target.id);
      if (tr && trPrev && !tr.destroyed && loc) this.announceBreak(tr, trPrev, loc);
      const killed = frame.rigs.find((r) => r.id === target.id)?.destroyed && !target.destroyed;
      if (killed) { this.bark(actor, "kill"); setTimeout(() => this.bark(target, "die"), 350); }
      else if (sp >= 3) { this.bark(Math.random() < 0.5 ? actor : target, Math.random() < 0.5 ? "hit" : "hurt"); }
      else this.bark(actor, sp > 0 ? "hit" : "miss");
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
        setTimeout(() => fx.text(up(actor, 4.6), `+${l.vp.amount} VP`, l.vp.side === "a" ? "#5fd3c0" : "#e0533d"), 900 / this.speed);
        this.onScore(l);
      }
    } else if (l.kind === "score") {
      // Round-end beacon payout: the beacon flares in the scorer's colour.
      const at = new THREE.Vector3(l.x ?? 0, 4.2, l.y ?? 0);
      if (l.contested) fx.text(at, "CONTESTED", "#ffffff");
      else {
        const col = l.side === "a" ? 0x5fd3c0 : 0xe0533d;
        this.world.pulseObjective(l.objective, col);
        fx.text(at, `+${l.vp} VP`, l.side === "a" ? "#5fd3c0" : "#e0533d");
        this.sound(() => sfx.score(l.side === this.side));
        this.onCamera({ x: l.x, y: l.y }, { owner: l.side, score: true });
        this.onScore(l);
      }
      await wait(650 / this.speed);
    } else if (l.kind === "blast") {
      const t = this.mechs.get(l.rigId);
      if (t) { fx.explosion(up(t, 1), false); this.sound(() => sfx.explosion(false)); }
      await wait(250 / this.speed);
    } else if (l.kind === "grit") {
      // The side that's behind digs in: a Grit token arrives.
      this.onBanner(`GRIT · ${l.side === this.side ? "YOU DIG IN" : "THE ENEMY DIGS IN"}`, "grit");
      this.sound(() => sfx.score(l.side === this.side));
      await wait(400 / this.speed);
    } else if (l.kind === "initiative") {
      this.onBanner(l.summary, "info");
    } else if (actor && l.summary) {
      if (l.rolls?.length && l.kind === "reaction" && this.onDice && !this.skipping && !this.quiet) this.onDice(l);
      // Preparations, reactions, equipment, reloads… a short tag over the rig.
      const short = { prepare: "PREPARED", reload: "RELOAD", repair: "REPAIR", reaction: "REACTION!", equipment: "SYSTEM", lock: "LOCK", emplace: "EMPLACED", barrage: "BARRAGE", shutdown: "SHUT DOWN", perk: null }[l.kind];
      if (short) fx.text(up(actor, 3.4), l.improved && short === "REACTION!" ? "IMPROVED REACTION!" : short, l.improved ? "#f0cf7a" : "#9fd8ff");
      if (l.kind === "barrage") fx.explosion(up(actor, 1.5), false);
      await wait(150 / this.speed);
    }
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
