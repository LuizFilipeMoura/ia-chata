// Replay theatre: plays recorded frames (a GA feature match or an on-demand bot
// match) through the Director with play/pause, speed and scrubbing.
import { Director } from "./director.js";
import { Hud } from "../ui/hud.js";
import { el, clear, fill } from "../ui/dom.js";
import { Minimap } from "../ui/minimap.js";
import { CHASSIS } from "/shared/game-state.js";

const WEIGHT_HELP = {
  vp: "Value of taking / approaching objectives", priority: "Value of damaging the priority target",
  damage: "Value of expected damage dealt", threat: "Penalty for standing where enemies can hit",
  heat: "Penalty for heat (overheat risk)", fragile: "Extra caution when a location is nearly dead",
  tactics: "Value of special actions (stances, equipment, shutdown)",
};

export class Replay {
  constructor(world, hudRoot, replay, { onExit }) {
    this.world = world; this.replay = replay; this.frames = replay.frames || []; this.i = 0; this.playing = true; this.onExit = onExit;
    this.hud = new Hud(hudRoot);
    this.director = new Director(world, { onLog: (l) => this.hud.log(l), onBanner: (t, k) => this.hud.banner(t, k) });
    const f0 = this.frames[0];
    world.buildField(replay.field || { width: 54, height: 36, terrain: replay.terrain || [] }, replay.objectives || []);
    this.director.snap(f0);
    this.controls = el("div", { class: "replay-bar" });
    this.brain = el("div", { class: "brain" });
    hudRoot.append(this.controls, this.brain);
    this.renderBrain(null);
    this.minimap = new Minimap(hudRoot, world);
    this.minimap.set(replay.field, replay.objectives, f0.rigs, null);
    this.renderControls();
    this.loop();
  }

  stateLike(f) {
    // Enough of a publicState for the HUD cards.
    const rigs = f.rigs.map((r) => {
      const ch = CHASSIS.find((c) => c.id === r.chassis) || {};
      return { ...r, weightClass: ch.class, weapons: { longRange: ch.longRange, melee: ch.melee }, engine: { heat: r.heat, ...(r.sp.engine ? { sp: r.sp.engine[0], max: r.sp.engine[1] } : {}) },
        hull: { sp: r.sp.hull[0], max: r.sp.hull[1] }, arms: { sp: r.sp.arms[0], max: r.sp.arms[1] }, legs: { sp: r.sp.legs[0], max: r.sp.legs[1] } };
    });
    return { rigs, game: { round: f.round, phase: f.phase, turn: f.turn, sides: [{ id: "a", vp: f.vp[0], bot: "A" }, { id: "b", vp: f.vp[1], bot: "B" }], priorityTargets: {} } };
  }

  async loop() {
    while (!this.dead) {
      if (!this.playing || this.i >= this.frames.length - 1) { await new Promise((r) => setTimeout(r, 150)); continue; }
      this.i++;
      const f = this.frames[this.i];
      await this.director.play(f);
      if (this.dead) return;
      const s = this.stateLike(f);
      this.hud.top(s, "a"); this.hud.roster(s, "a", f.turn?.activeRigId);
      this.renderBrain(f.thought);
      this.minimap.set(this.replay.field, this.replay.objectives, f.rigs, f.turn?.activeRigId);
      const r = f.turn?.activeRigId != null ? f.rigs.find((x) => x.id === f.turn.activeRigId) : null;
      if (r?.pos && this.follow) this.world.focus(r.pos.x, r.pos.y);
      this.renderControls();
    }
  }

  // What the bots are "thinking": each side's pilot weights, and for the latest
  // decision the top options with their weighted score terms.
  renderBrain(thought) {
    const p = this.replay.pilots;
    clear(this.brain);
    if (p) {
      const keys = ["vp", "priority", "damage", "threat", "heat", "fragile", "tactics"];
      const max = Math.max(1, ...keys.flatMap((k) => [p.a?.[k] ?? 0, p.b?.[k] ?? 0]));
      this.brain.append(el("div", { class: "pilots" }, ["a", "b"].map((s) => el("div", { class: `pilot p-${s}` },
        el("b", {}, `${s === "a" ? "Cyan" : "Red"} pilot${p.tiers?.[s] && p.tiers[s] !== "balanced" ? " · " + p.tiers[s] : ""}`),
        keys.map((k) => el("div", { class: "wrow", title: WEIGHT_HELP[k] }, el("span", {}, k), el("div", { class: "wbar" }, el("i", { style: { width: `${((p[s]?.[k] ?? 0) / max) * 100}%` } })), el("em", {}, String(p[s]?.[k] ?? "–"))))))));
    }
    if (thought?.top?.length) {
      const terms = ["vp", "priority", "damage", "tactics", "threat", "heat", "fragile"];
      const scale = Math.max(0.5, ...thought.top.map((t) => terms.reduce((a, k) => a + Math.abs(t.parts[k] || 0), 0)));
      this.brain.append(el("div", { class: `thought p-${thought.side}` },
        el("b", {}, `🧠 ${thought.rig} weighs its options`),
        thought.top.map((t) => el("div", { class: `opt ${t.picked ? "picked" : ""}` },
          el("div", { class: "ol" }, el("span", {}, `${t.picked ? "▶ " : ""}${t.label}${t.blunder ? " (blunder!)" : ""}`), el("em", {}, t.score.toFixed(2))),
          el("div", { class: "stack" }, terms.filter((k) => t.parts[k]).map((k) => el("i", { class: `t-${k}`, title: `${k} ${t.parts[k]}`, style: { width: `${(Math.abs(t.parts[k]) / scale) * 100}%` } }))))),
        thought.passed ? el("div", { class: "muted small" }, "Nothing scored above 0 → ends activation.") : null,
        el("div", { class: "tkey" }, terms.map((k) => el("span", { class: `t-${k}` }, k)))));
    }
  }

  seek(n) {
    this.i = Math.max(0, Math.min(this.frames.length - 1, n));
    this.director.snap(this.frames[this.i]);
    const s = this.stateLike(this.frames[this.i]); this.hud.top(s, "a"); this.hud.roster(s, "a", null);
    this.renderControls();
  }

  renderControls() {
    const f = this.frames[this.i];
    fill(this.controls, 
      el("button", { class: "btn ghost", onClick: () => this.exit() }, "✕"),
      el("button", { class: "btn", onClick: () => { this.playing = !this.playing; this.renderControls(); } }, this.playing ? "⏸" : "▶"),
      el("input", { type: "range", min: 0, max: this.frames.length - 1, value: this.i, onChange: (e) => this.seek(Number(e.target.value)) }),
      el("span", { class: "muted" }, `Round ${f?.round ?? "-"} · step ${this.i + 1}/${this.frames.length}`),
      ...[0.5, 1, 2, 4].map((s) => el("button", { class: `btn ${this.director.speed === s ? "primary" : "ghost"}`, onClick: () => { this.director.speed = s; this.renderControls(); } }, `${s}×`)),
      el("label", { class: "muted" }, el("input", { type: "checkbox", checked: !!this.follow, onChange: (e) => { this.follow = e.target.checked; } }), " follow"),
      this.i >= this.frames.length - 1 ? el("b", {}, this.replay.winner ? `${this.replay.winner.toUpperCase()} WINS ${this.replay.vp?.join("–")}` : "DRAW") : null,
    );
  }

  exit() { this.destroy(); this.onExit?.(); }
  destroy() { this.dead = true; this.minimap.destroy(); this.director.reset(); this.hud.destroy(); }
}
