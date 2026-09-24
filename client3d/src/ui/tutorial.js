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

// Short steps — one idea each, two sentences max. Most advance when you
// actually do the thing.
export function tutorialSteps() {
  return [
    { title: "Welcome, Commander", text: "You lead the CYAN mechs; the bot leads the RED ones. Pan with WASD, rotate with Q/E, zoom with the wheel.", next: true },
    { title: "How to win", text: "Stand next to the glowing pylons to score points each round. Most points after 10 rounds wins — or wreck the whole enemy squad.", highlight: ".hud-top", next: true },
    { title: "Wait for your turn", text: "Sides take turns activating one mech at a time.", highlight: ".hud-top .turn", done: (m) => m.myTurn, waitText: "The enemy is going first…" },
    { title: "Pick a mech", text: "Click one of your mechs, or its card on the left.", highlight: ".hud-roster:not(.enemy)", done: (m) => { const r = m.rig(m.selected); return r && r.owner === m.side && !r.activated; } },
    { title: "Walk toward a pylon", text: "Press Move, then click inside the green ring. Each mech gets 3 actions per turn.", highlight: '[data-act="move"], [data-act="sprint"]', done: (m, ev) => ev.moved },
    { title: "Watch your heat 🔥", text: "Every action costs heat (the 🔥 on each button). Go past the bar's limit and your mech may break itself at the end of the turn.", highlight: ".rig-card.active .rc-heat, .rig-card.sel .rc-heat", next: true },
    { title: "Shoot what's in front", text: "You can only attack enemies inside your front arc — hitting their side or back hurts more. Press Fire if anyone's in range.", highlight: '[data-act="fire"]', done: (m, ev) => ev.attacked, skippable: true },
    { title: "Stuck? Ask the Advisor", text: "💡 Advisor shows the smartest move for this mech. Try it!", highlight: '[data-act="advisor"]', done: (m, ev) => ev.advised, skippable: true },
    { title: "End your turn", text: "Press End activation (or Enter). Running hot? Shut Down instead — it cools you off.", highlight: '[data-act="end"], [data-act="shutdown"]', done: (m, ev) => ev.ended },
    { title: "You've got it!", text: "Keep going: hold pylons, gang up on the ★ enemy for bonus points, and don't cook yourself. 📖 has the rules if you need them.", next: true, last: true },
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
