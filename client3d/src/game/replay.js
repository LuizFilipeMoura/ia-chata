// Replay theatre: plays recorded frames (a GA feature match or an on-demand bot
// match) through the Director with play/pause, speed and scrubbing.
import { Director } from "./director.js";
import { Hud } from "../ui/hud.js";
import { el, clear, fill, modal } from "../ui/dom.js";
import { Minimap } from "../ui/minimap.js";
import { Nameplates } from "../ui/nameplates.js";
import { openInspector } from "../ui/inspector.js";
import { setRigSource } from "../ui/combatlog.js";
import { CHASSIS } from "/shared/game-state.js";
import { DiceTray } from "../ui/dicetray.js";
import { settings } from "../settings.js";

// Plain-language pilot vocabulary, shared by the summary and the full menu.
const TRAITS = {
  vp: ["Objectives", "How much it wants to stand on salvage beacons (the points that win games)."],
  priority: ["Hunting the ★ target", "How hard it chases the one enemy worth +2 points if destroyed."],
  damage: ["Aggression", "How much it values dealing damage."],
  threat: ["Caution", "How much it avoids standing where enemies can shoot it."],
  heat: ["Heat discipline", "How much it avoids overheating its own boiler."],
  fragile: ["Self-preservation", "Extra caution once a part of it is badly damaged."],
  tactics: ["Specials", "How keen it is on stances, equipment and Shut Down."],
};
const HABITS = { move: "walking", sprint: "sprinting", fire: "plain shots", aimed: "aimed shots", prepare: "setting reactions", repair: "repairing", shutdown: "shutting down to cool", special: "special actions" };
const TIER_TEXT = {
  easy: "Easy bot: reckless, ignores heat and objectives, and blunders often (55% of decisions are a random pick from its top options).",
  normal: "Normal bot: balanced priorities, occasional mistakes (10% of decisions).",
  hard: "Hard bot: the genetic search's champion. Evolved priorities, best builds, never blunders.",
  balanced: "Evolved pilot: priorities bred by the genetic search. Never blunders on purpose.",
};
const TERM_TEXT = { vp: "objectives", priority: "★ target", damage: "damage", tactics: "specials", bias: "habit", threat: "danger (−)", heat: "heat (−)", fragile: "self-preservation (−)" };


export class Replay {
  constructor(world, hudRoot, replay, { onExit }) {
    setRigSource((n) => this.rigByName(n));
    this.world = world; this.replay = replay; this.frames = replay.frames || []; this.i = 0; this.playing = true; this.onExit = onExit;
    this.hud = new Hud(hudRoot);
    this.hud.spectator = true;
    this.tray = new DiceTray(hudRoot);
    this.director = new Director(world, {
      onLog: (l, round) => this.hud.log(l, round), onBanner: (t, k) => this.hud.banner(t, k),
      onCamera: (p, { punch } = {}) => { if (this.follow && p) this.world.focus(p.x, p.y, punch ? Math.min(this.world.cam.dist, 26) : undefined); },
      onDice: (l) => (settings.get("diceTray") ? this.tray.show(l, { speed: this.director.speed }) : null),
      onScore: (l) => { const side = l.kind === "score" ? l.side : l.vp?.side; const amt = l.kind === "score" ? l.vp : l.vp?.amount; if (side && amt) this.hud.scoreFlash(side, amt); },
    });
    const f0 = this.frames[0];
    world.buildField(replay.field || { width: 54, height: 36, terrain: replay.terrain || [] }, replay.objectives || []);
    this.director.snap(f0);
    this.controls = el("div", { class: "replay-bar" });
    this.brain = el("div", { class: "brain" });
    hudRoot.append(this.controls, this.brain);
    this.renderBrain(null);
    this.minimap = new Minimap(hudRoot, world);
    this.minimap.set(replay.field, replay.objectives, f0.rigs, null);
    this.plates = new Nameplates(hudRoot, world, this.director);
    this.plates.set(this.stateLike(f0).rigs);
    this.renderControls();
    // Click any mech (or its roster card) to inspect it.
    this.unclick = world.on("click", (hit) => { if (hit.mechId != null) this.inspect(hit.mechId); });
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
      this.hud.top(s, "a"); this.hud.roster(s, "a", f.turn?.activeRigId, (id) => this.inspect(id));
      this.renderBrain(f.thought);
      this.minimap.set(this.replay.field, this.replay.objectives, f.rigs, f.turn?.activeRigId);
      this.plates.set(s.rigs, { activeId: f.turn?.activeRigId });
      const r = f.turn?.activeRigId != null ? f.rigs.find((x) => x.id === f.turn.activeRigId) : null;
      if (r?.pos && this.follow) this.world.focus(r.pos.x, r.pos.y);
      this.renderControls();
    }
  }

  // What the bots are "thinking": each side's pilot weights, and for the latest
  // decision the top options with their weighted score terms.
  renderBrain(thought) {
    const p = this.replay.pilots;
    fill(this.brain);
    if (p) {
      // Compact summary; the full explanation is one click away.
      this.brain.append(el("div", { class: "pilots-sum" },
        ["a", "b"].map((side) => el("div", { class: `ps p-${side}` }, el("b", {}, side === "a" ? "Cyan pilot" : "Red pilot"), el("span", {}, this.pilotTag(side)))),
        el("button", { class: "btn ghost", onClick: () => this.pilotMenu() }, "ⓘ Explain the pilots")));
    }
    if (thought?.top?.length) {
      const terms = Object.keys(TERM_TEXT);
      const scale = Math.max(0.5, ...thought.top.map((t) => terms.reduce((a, k) => a + Math.abs(t.parts[k] || 0), 0)));
      this.brain.append(el("div", { class: `thought p-${thought.side}` },
        el("b", {}, `🧠 What ${thought.rig} considered`),
        el("div", { class: "muted small" }, "Its best options, highest score first. Each bar shows what the score was made of."),
        thought.top.map((t) => el("div", { class: `opt ${t.picked ? "picked" : ""}` },
          el("div", { class: "ol" }, el("span", {}, `${t.picked ? "▶ " : ""}${t.label}${t.blunder ? " (a blunder!)" : ""}`), el("em", {}, t.score.toFixed(1))),
          el("div", { class: "stack" }, terms.filter((k) => t.parts[k]).map((k) => el("i", { class: `t-${k}`, title: `${TERM_TEXT[k]}: ${t.parts[k] > 0 ? "+" : ""}${t.parts[k]}`, style: { width: `${(Math.abs(t.parts[k]) / scale) * 100}%` } }))))),
        thought.passed ? el("div", { class: "muted small" }, "Nothing was worth doing, so it ended its turn.") : null,
        el("div", { class: "tkey" }, terms.map((k) => el("span", { class: `t-${k}` }, TERM_TEXT[k])))));
    }
  }

  pilotTag(side) {
    const tier = this.replay.pilots?.tiers?.[side];
    return tier && tier !== "balanced" ? `${tier[0].toUpperCase()}${tier.slice(1)} bot` : "evolved pilot";
  }

  // The full menu: every priority and habit of both pilots, explained.
  pilotMenu() {
    const p = this.replay.pilots;
    const keys = Object.keys(TRAITS);
    const max = Math.max(1, ...keys.flatMap((k) => [p.a?.[k] ?? 0, p.b?.[k] ?? 0]));
    const col = (side) => {
      const w = p[side] || {};
      const habits = Object.entries(w).filter(([k, v]) => k.startsWith("b_") && Math.abs(v) >= 0.05).sort((a, b) => b[1] - a[1]);
      return el("div", { class: `pm-col p-${side}` },
        el("h3", {}, side === "a" ? "Cyan pilot" : "Red pilot", el("span", { class: "muted" }, ` · ${this.pilotTag(side)}`)),
        el("p", { class: "muted" }, TIER_TEXT[p.tiers?.[side]] || TIER_TEXT.balanced),
        el("h4", {}, "Priorities"),
        keys.map((k) => el("div", { class: "pm-row" },
          el("div", { class: "pm-top" }, el("b", {}, TRAITS[k][0]), el("span", { class: "pm-v" }, (w[k] ?? 0).toFixed(2))),
          el("div", { class: "wbar" }, el("i", { style: { width: `${((w[k] ?? 0) / max) * 100}%` } })),
          el("div", { class: "muted small" }, TRAITS[k][1]))),
        el("h4", {}, "Habits"),
        habits.length ? habits.map(([k, v]) => el("div", { class: `pm-habit ${v > 0 ? "pos" : "neg"}` }, `${v > 0 ? "Likes" : "Avoids"} ${HABITS[k.slice(2)] || k.slice(2)}`, el("span", { class: "muted" }, ` (${v > 0 ? "+" : ""}${v})`)))
          : el("p", { class: "muted small" }, "No learned habits: this pilot judges each action purely on its priorities."));
    };
    modal({
      title: "How the pilots think", cls: "wide",
      body: el("div", { class: "pm" },
        el("p", {}, "Every decision, a bot scores each legal action. The score adds up what the action achieves (objectives, damage, specials) and subtracts what it risks (danger, heat), each multiplied by the pilot's priority for it. It picks the highest score. Priorities are relative: what matters is how they compare."),
        el("div", { class: "pm-cols" }, col("a"), col("b"))),
      actions: [{ label: "Close", primary: true }],
    });
  }


  // Ledger chips (Toughness / Penetration / Damage) open rigs by name.
  rigByName(n) {
    const f = this.frames?.[this.i]; if (!f) return null;
    const r = this.stateLike(f).rigs.find((x) => x.name === n); if (!r) return null;
    const sq = this.replay.squadsFull || this.replay.squads || {};
    return { rig: r, loadout: [...(sq.a || []), ...(sq.b || [])].find((u) => u && u.chassis === r.chassis) || null };
  }

  inspect(id) {
    const f = this.frames[this.i];
    const r = this.stateLike(f).rigs.find((x) => x.id === id);
    if (!r) return;
    const sq = this.replay.squadsFull || this.replay.squads || {};
    const loadout = [...(sq.a || []), ...(sq.b || [])].find((u) => u && u.chassis === r.chassis) || null;
    openInspector(r, { loadout });
  }

  seek(n) {
    this.i = Math.max(0, Math.min(this.frames.length - 1, n));
    this.director.snap(this.frames[this.i]);
    const s = this.stateLike(this.frames[this.i]); this.hud.top(s, "a"); this.hud.roster(s, "a", null, (id) => this.inspect(id));
    this.renderControls();
  }

  // Built once, then updated in place, rebuilding every frame detached the
  // controls mid-click and yanked the slider out from under a drag.
  renderControls() {
    if (!this.ui) {
      const u = (this.ui = {});
      u.play = el("button", { class: "btn", onClick: () => { this.playing = !this.playing; this.renderControls(); } });
      u.slider = el("input", { type: "range", min: 0, max: this.frames.length - 1, value: 0 });
      u.slider.addEventListener("input", () => { this.dragging = true; });
      u.slider.addEventListener("change", (e) => { this.dragging = false; this.seek(Number(e.target.value)); });
      u.label = el("span", { class: "muted" });
      u.speeds = [0.5, 1, 2, 4].map((sp) => el("button", { class: "btn ghost", onClick: () => { this.director.speed = sp; this.renderControls(); } }, `${sp}×`));
      u.skip = el("button", { class: "btn ghost", title: "Finish the current animation", onClick: () => this.director.skip() }, "⏭");
      u.follow = el("input", { type: "checkbox", onChange: (e) => { this.follow = e.target.checked; } });
      u.result = el("b", {});
      fill(this.controls, el("button", { class: "btn ghost", onClick: () => this.exit() }, "✕"), u.play, u.slider, u.label, u.speeds, u.skip, el("label", { class: "muted" }, u.follow, " follow"), u.result);
    }
    const u = this.ui, f = this.frames[this.i];
    u.play.textContent = this.playing ? "⏸" : "▶";
    if (!this.dragging) u.slider.value = String(this.i);
    u.label.textContent = `Round ${f?.round ?? "-"} · step ${this.i + 1}/${this.frames.length}`;
    u.speeds.forEach((b, k) => { b.className = `btn ${this.director.speed === [0.5, 1, 2, 4][k] ? "primary" : "ghost"}`; });
    u.result.textContent = this.i >= this.frames.length - 1 ? (this.replay.winner ? `${this.replay.winner.toUpperCase()} WINS ${this.replay.vp?.join("–")}` : "DRAW") : "";
  }

  exit() { this.destroy(); this.onExit?.(); }
  destroy() { this.tray.destroy(); this.unclick?.(); document.querySelector(".inspector")?.remove(); this.dead = true; this.minimap.destroy(); this.plates.destroy(); this.director.dispose(); this.hud.destroy(); }
}
