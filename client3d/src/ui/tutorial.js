// Guided tutorial: a coach panel walks the player through a real match vs the
// Easy bot. Each step explains one idea, optionally highlights a HUD element,
// and advances when the player actually does the thing (predicate over the live
// match's events/state) — or on "Next" for pure-explanation steps.
import { el, clear, fill } from "./dom.js";
import { heatTable } from "./hud.js";
import { HEAT_CAPACITY } from "/shared/rules.js";

export const TUTORIAL_SQUAD = [
  { chassis: "medium-lance-mortar", equipment: "radiator-array" },
  { chassis: "light-claw-autocannon", equipment: "ablative-plating" },
  { chassis: "light-saw-minigun", equipment: "targeting-computer" },
];

export function tutorialSteps() {
  return [
    { title: "Welcome, Commander", text: "This is a skirmish between two squads of dieselpunk Rigs on a tabletop. You command the CYAN rigs; the bot commands the RED ones. Let's learn by playing a real match against the Easy bot.", next: true },
    { title: "Move the camera", text: "Pan with WASD (or arrow keys, or drag). Rotate with Q/E or right-drag. Zoom with the mouse wheel. Take a look around, then press Next.", next: true, done: (m, ev) => ev.camera },
    { title: "How you win", text: "The glowing pylons are OBJECTIVES. At the end of each round, a side with a rig within 2\" of a pylon (and no enemy on it) scores its VP — the centre pylon is worth 2, the others 1. Destroying the enemy's ★ Priority target is worth +2. After 10 rounds, most VP wins — or wipe the enemy out.", highlight: ".hud-top", next: true },
    { title: "Turns", text: "Sides alternate activating one rig at a time. Each rig activates once per round and gets 3 ACTIONS. Wait for 'YOUR TURN' at the top.", highlight: ".hud-top .turn", done: (m) => m.myTurn, waitText: "Waiting for your turn…" },
    { title: "Pick a rig", text: "Click one of your cyan-ringed rigs (or its card on the left, or press Tab). Its actions appear at the bottom.", highlight: ".hud-roster:not(.enemy)", done: (m) => { const r = m.rig(m.selected); return r && r.owner === m.side && !r.activated; } },
    { title: "Every action makes HEAT", text: "Each button shows its heat cost 🔥. The heat bar on the card shows your capacity — light rigs hold 6, mediums 5. Heat bleeds off only 1 per round, so over-acting is how rigs die. A red-bordered button would push you over capacity.", highlight: ".hud-actions", next: true },
    { title: "Move toward an objective", text: "Press Move (key 1) — or Sprint (key 2) to go 1½× as far for double heat. The ring is your reach. Hover to preview the route, Shift+wheel to turn, click to walk. Head for a pylon!", highlight: '[data-act="move"], [data-act="sprint"]', done: (m, ev) => ev.moved },
    { title: "Facing matters", text: "The notch on your base is your FRONT. You can only attack enemies inside your front 90° arc — and hitting an enemy's SIDE or REAR arc deals more damage. Flanking wins fights.", next: true },
    { title: "Attack!", text: "If an enemy is in your front arc and range, press Fire (key 3), then click a red-ringed enemy to see each weapon's expected damage. No target? Move closer or use the Advisor.", highlight: '[data-act="fire"]', done: (m, ev) => ev.attacked, skippable: true },
    { title: "The overheat roll", text: "When an activation ends above capacity you roll D12 + 2×(heat over cap). Here's the table — high rolls wreck your own rig:", extra: () => heatTable(), next: true },
    { title: "End the activation", text: "Press 'End activation' (or Enter). If you're running hot, Shut Down instead: it ends the activation and vents 2 heat per unused action.", highlight: '[data-act="end"]', done: (m, ev) => ev.ended },
    { title: "The enemy acts", text: "Watch the bot take its turn. Bots obey exactly the same rules you do — the server runs both.", done: (m) => m.myTurn, waitText: "Enemy is moving…" },
    { title: "Ask the Advisor", text: "Stuck? Select a rig and press 💡 Advisor: the Hard bot's brain evaluates every legal action for YOUR rig and suggests the best one. Try it now.", highlight: '[data-act="advisor"]', done: (m, ev) => ev.advised },
    { title: "Reactions & Answer tokens", text: "Prepare (key 5) sets a face-down reaction — Brace soaks a hit, Evasive may dodge, Return Fire shoots back. At the start of some rounds you also get a free Answer token to place one. Both reveal when the enemy attacks.", next: true },
    { title: "You're ready", text: "Keep playing this match: hold objectives, focus fire on the ★ priority target, manage your heat. Close this coach any time with ✕. Good hunting!", next: true, last: true },
  ];
}

export class Coach {
  constructor(root, match) {
    this.root = root; this.match = match; this.i = 0; this.steps = tutorialSteps(); this.ev = {};
    this.panel = el("div", { class: "coach" });
    root.append(this.panel);
    const on = (type, fn) => match.events.addEventListener(type, (e) => { fn(e.detail); this.check(); });
    on("command", ({ verb, attrs }) => {
      if (verb === "action" && (attrs.action === "move" || attrs.action === "sprint")) this.ev.moved = true;
      if (verb === "action" && (attrs.action === "fire" || attrs.action === "aimed")) this.ev.attacked = true;
      if (verb === "endactivation" || attrs?.action === "shutdown") this.ev.ended = true;
    });
    on("advisor", () => { this.ev.advised = true; });
    on("state", () => {});
    on("select", () => {});
    this.camTimer = setInterval(() => { if (match.world.moved) { this.ev.camera = true; this.check(); } }, 400);
    this.render();
  }

  destroy() { clearInterval(this.camTimer); clearInterval(this.hlTimer); this.panel.remove(); this.unhighlight(); }

  check() {
    const s = this.steps[this.i];
    if (s?.done && s.done(this.match, this.ev)) this.advance();
    else this.render();
  }

  advance() {
    if (this.i < this.steps.length - 1) { this.i++; this.ev = { camera: this.ev.camera }; this.render(); setTimeout(() => this.check(), 50); }
  }

  unhighlight() { document.querySelectorAll(".coach-hl").forEach((n) => n.classList.remove("coach-hl")); }

  render() {
    const s = this.steps[this.i];
    this.unhighlight();
    if (s.highlight) document.querySelectorAll(s.highlight).forEach((n) => n.classList.add("coach-hl"));
    const waiting = s.done && !s.next && s.waitText && !s.done(this.match, this.ev);
    fill(this.panel, 
      el("div", { class: "coach-h" }, el("span", { class: "step" }, `${this.i + 1}/${this.steps.length}`), el("b", {}, s.title), el("button", { class: "x", title: "Close tutorial", onClick: () => this.destroy() }, "✕")),
      el("p", {}, s.text),
      s.extra ? s.extra() : null,
      waiting ? el("p", { class: "muted" }, s.waitText) : null,
      el("div", { class: "coach-a" },
        this.i > 0 ? el("button", { class: "btn ghost", onClick: () => { this.i--; this.render(); } }, "‹ Back") : null,
        s.next || s.skippable ? el("button", { class: "btn primary", onClick: () => s.last ? this.destroy() : this.advance() }, s.last ? "Let's go" : s.skippable ? "Skip ›" : "Next ›") : el("span", { class: "muted" }, "Do it to continue…")),
    );
    // Keep the highlight on elements that re-render (the action bar rebuilds).
    clearInterval(this.hlTimer);
    if (s.highlight) this.hlTimer = setInterval(() => document.querySelectorAll(s.highlight).forEach((n) => n.classList.add("coach-hl")), 500);
  }
}
