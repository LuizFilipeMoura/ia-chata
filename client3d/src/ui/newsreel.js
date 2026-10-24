// The replay theatre as a wartime newsreel: heavy grain, projector flicker,
// iris-in / iris-out transitions and silent-film intertitle cards ("THE BATTLE
// OF ...", one card per round, "THE END"). Pure presentation over the Replay;
// a click skips a card, and reduced motion drops the flicker and the iris.
import "./posters.css";
import { el } from "./dom.js";
import { sfx } from "../audio.js";
import { intertitles } from "./moments-logic.js";
import { reducedMotion } from "./posters.js";

export class Newsreel {
  constructor(host, { frames = [], place = "the Front" } = {}) {
    this.titles = intertitles(frames, place);
    this.calm = reducedMotion();
    this.text = el("div", { class: "nr-text" });
    this.card = el("div", { class: "nr-card", onClick: () => this.skip?.() }, el("div", { class: "nr-frame" }, this.text));
    this.iris = el("div", { class: "nr-iris" });
    this.root = el("div", { class: `newsreel ${this.calm ? "calm" : ""}`, "aria-live": "polite" },
      el("div", { class: "nr-grain" }), el("div", { class: "nr-flicker" }), el("div", { class: "nr-scratch" }), this.iris, this.card);
    host.append(this.root);
    sfx.projector?.();
  }

  // The round card due before frame i, if any (not the opening or THE END).
  titleAt(i) { return this.titles.find((t) => t.at === i && t.kind === "round") || null; }
  get opening() { return this.titles[0]; }
  get ending() { return this.titles[this.titles.length - 1]; }

  // Iris shut, show a card, iris open. Resolves when it's done (or clicked).
  show(t, ms = 1500) {
    if (!t || this.dead) return Promise.resolve();
    return new Promise((resolve) => {
      const hold = this.calm ? Math.min(ms, 900) : ms;
      this.text.textContent = t.text;
      this.card.className = `nr-card on k-${t.kind}`;
      this.iris.classList.add("shut");
      sfx.tapeHiss?.();
      const done = () => {
        if (!this.skip) return;
        this.skip = null; clearTimeout(timer);
        this.card.classList.remove("on");
        this.iris.classList.remove("shut");
        setTimeout(resolve, this.calm ? 0 : 450);
      };
      this.skip = done;
      const timer = setTimeout(done, (this.calm ? 0 : 450) + hold);
    });
  }

  destroy() { this.dead = true; this.skip?.(); this.root.remove(); }
}
