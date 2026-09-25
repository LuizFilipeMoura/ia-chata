// Worked attack examples for the Training Grounds: real engine resolutions,
// not mock-ups. Rebuild a lesson scenario locally, fire with seeded dice, and
// keep the first seed that produces each outcome (miss, bounce, wound, lucky
// natural 10, a part breaking). The rules decide; we only pick the dice.
import { el } from "./dom.js";
import { createRoom, applyCommand } from "/shared/game-state.js";
import { mulberry32 } from "/shared/sim/match.js";
import { breakdownBody } from "./combatlog.js";
import { rich } from "./glossary.js";

function shoot(scenario, seed, attrs, tweak) {
  const room = createRoom("EX");
  applyCommand(room, { verb: "scenario", attrs: { id: scenario } });
  tweak?.(room);
  const random = mulberry32(seed);
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" }, { random });
  applyCommand(room, { verb: "action", attrs: { name: "Copper", ...attrs } }, { side: "a" }, { random });
  return { res: room.game.resolutions.filter((r) => r.kind === "attack").at(-1), room };
}
const step = (b, k) => b?.steps?.find((s) => s.kind === k);
const hits = (b) => (step(b, "hit")?.dice || []).filter((d) => d.ok).length;

const FIRE = { action: "fire", weapon: "longRange", target: "Dummy" };
const CASES = {
  // Sniper Cannon (1 die) fired point-blank, 16" off its sweet spot: often a clean miss.
  miss: { scenario: "equipment", attrs: FIRE, tweak: (r) => { r.rigs[0].pos = { x: 24, y: 18 }; }, test: (b) => hits(b) === 0 },
  // Rivet Gun (Pen 3) into a medium's front armour: hits that don't get through.
  bounce: { scenario: "attackdemo", attrs: FIRE, test: (b) => hits(b) > 0 && !b.sp },
  wound: { scenario: "attackdemo", attrs: FIRE, test: (b) => { const w = step(b, "wound"); return b.sp > 0 && w?.dice?.some((d) => !d.ok) && !w.dice.some((d) => d.value === 10); } },
  lucky: { scenario: "attackdemo", attrs: FIRE, test: (b) => { const w = step(b, "wound"); return w && w.target >= 8 && w.dice.filter((d) => d.ok).length === 1 && w.dice.some((d) => d.value === 10 && d.ok); } },
  flank: { scenario: "fire", attrs: FIRE, test: (b) => b.sp > 0 },
  breaks: { scenario: "anatomy", attrs: { action: "aimed", weapon: "longRange", target: "Dummy", loc: "engine" }, test: (b, room) => room.rigs.find((x) => x.name === "Dummy").engine.sp <= 0 },
};

const cache = {};
export function attackExample(kind) {
  if (cache[kind]) return cache[kind];
  const c = CASES[kind];
  for (let seed = 1; seed < 3000; seed++) {
    const { res, room } = shoot(c.scenario, seed, c.attrs, c.tweak);
    if (res?.breakdown && c.test(res.breakdown, room)) return (cache[kind] = res);
  }
  return null;
}

export const woundNeed = (b) => step(b, "wound")?.target;
export const woundInfo = (b) => { const w = step(b, "wound"); return w ? `Pen ${w.pen} vs Toughness ${w.toughness}: needs ${w.target}+` : ""; };

export function exampleCard(kind, caption) {
  const r = attackExample(kind);
  return el("div", { class: "ex" },
    el("div", { class: "ex-cap" }, rich(typeof caption === "function" ? (r ? caption(r.breakdown) : "") : caption)),
    r ? el("div", { class: "ex-card clog-card" }, breakdownBody(r)) : el("p", { class: "muted" }, "(no example found)"));
}
