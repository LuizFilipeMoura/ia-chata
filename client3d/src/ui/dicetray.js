// Dice tray: the engine's actual rolls, tumbled on screen as they happen. An
// attack rolls its four steps in order (to-hit D6s, the D12 location, D10
// wounds), each die spinning before it settles green (success) or red (fail),
// so you watch the dice decide the shot instead of reading about it later.
// show() resolves once the to-hit dice have landed, so the Director can fire
// the projectiles right as the dice settle; later rows keep rolling alongside.
import { el } from "./dom.js";
import { sfx } from "../audio.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOC = { hull: "Hull", arms: "Arms", legs: "Legs", engine: "Engine" };

export class DiceTray {
  constructor(parent) {
    this.root = el("div", { class: "dicetray" });
    parent.append(this.root);
    this.token = 0;
  }

  // Rows from a log entry: [{ label, sides, need, dice: [{ value, ok }] }].
  rows(l) {
    const b = l.breakdown;
    if (l.kind === "attack" && b?.steps) {
      const out = [];
      for (const s of b.steps) {
        if (s.kind === "hit" && s.dice?.length) out.push({ label: s.grit ? "To hit (Grit)" : "To hit", sides: 6, need: s.target, dice: s.dice.map((d) => ({ value: d.value, ok: d.ok, from: d.rerolledFrom })) });
        else if (s.kind === "location") out.push(s.die != null
          ? { label: "Location", sides: 12, dice: [{ value: s.die, ok: true }], out: LOC[String(s.out).split(" ")[0]] || s.out }
          : { label: "Location", sides: null, dice: [], out: `${LOC[String(s.out).split(" ")[0]] || s.out} (aimed)` });
        else if (s.kind === "wound" && s.dice?.length) out.push({ label: "Wound", sides: 10, need: s.target, dice: s.dice.map((d) => ({ value: d.value, ok: d.ok })) });
      }
      return out;
    }
    if (l.rolls?.length) return [{ label: labelFor(l), sides: l.rolls[0].sides, dice: l.rolls.map((r) => ({ value: r.value, ok: r.tone !== "miss" && r.tone !== "bad" })) }];
    return [];
  }

  // speed: the Director's playback speed. Resolves when the first row lands.
  async show(l, { speed = 1, title = "" } = {}) {
    const rows = this.rows(l);
    if (!rows.length) return;
    const token = ++this.token;
    this.root.replaceChildren(el("div", { class: "dt-title" }, title || l.summary?.split(":")[0] || ""));
    this.root.classList.remove("out");
    this.root.style.display = "";
    const roll = async (row) => {
      const dice = row.dice.map((d) => el("span", { class: `dt-die d${row.sides || 0}` }, "?"));
      this.root.append(el("div", { class: "dt-row" },
        el("b", { class: "dt-l" }, row.label, row.sides ? el("small", {}, ` D${row.sides}`) : null, row.need != null ? el("small", { class: "dt-need" }, ` need ${row.need}+`) : null),
        el("span", { class: "dt-dice" }, dice),
        row.out ? el("span", { class: "dt-out" }, `→ ${row.out}`) : null));
      if (!row.sides) return;
      sfx.dice(dice.length);
      const t0 = performance.now(), dur = 420 / speed;
      while (performance.now() - t0 < dur) {
        if (token !== this.token) return;
        dice.forEach((d) => { d.textContent = String(1 + Math.floor(Math.random() * row.sides)); });
        await wait(45);
      }
      // Grit: misses land first, then roll again and settle with a gold rim.
      row.dice.forEach((r, i) => { dice[i].textContent = String(r.from ?? r.value); dice[i].classList.add(r.from != null ? "no" : r.ok ? "ok" : "no"); });
      const again = row.dice.map((r, i) => (r.from != null ? i : -1)).filter((i) => i >= 0);
      if (!again.length) return;
      await wait(300 / speed);
      if (token !== this.token) return;
      sfx.dice(again.length);
      const t1 = performance.now();
      while (performance.now() - t1 < dur * 0.7) {
        if (token !== this.token) return;
        again.forEach((i) => { dice[i].classList.remove("no"); dice[i].textContent = String(1 + Math.floor(Math.random() * row.sides)); });
        await wait(45);
      }
      again.forEach((i) => { const r = row.dice[i]; dice[i].textContent = String(r.value); dice[i].classList.add("rr", r.ok ? "ok" : "no"); dice[i].title = `Grit reroll: ${r.from} → ${r.value}`; });
    };
    await roll(rows[0]);
    // The rest roll while the shot flies.
    (async () => {
      for (const row of rows.slice(1)) { await wait(260 / speed); if (token !== this.token) return; await roll(row); }
      await wait(2400);
      if (token === this.token) { this.root.classList.add("out"); setTimeout(() => { if (token === this.token) this.root.style.display = "none"; }, 400); }
    })();
  }

  hide() { this.token++; this.root.style.display = "none"; }
  destroy() { this.root.remove(); }
}

function labelFor(l) {
  return { overheat: "Overheat", reaction: "Evade", blast: "Blast wound", destruction: "Cook-off" }[l.kind] || "Roll";
}
