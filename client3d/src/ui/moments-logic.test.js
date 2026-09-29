import { test } from "node:test";
import assert from "node:assert/strict";
import { factionsFor, stationCalls, momentsBetween, pulpCover, intertitles, whisperFor, NATURE_LABEL } from "./moments-logic.js";
import { PROPAGANDA_IDS } from "../propaganda.js";

const st = (over = {}) => ({
  rigs: over.rigs || [{ id: 1, name: "Copper", owner: "a" }, { id: 2, name: "Zebra", owner: "b" }],
  game: { round: 2, sides: [{ id: "a", vp: 0 }, { id: "b", vp: 0 }], priorityTargets: { a: 2 }, beacons: { lit: 0, next: 3 }, ...over.game },
});

test("factionsFor is stable, valid and never mirrors", () => {
  for (const room of ["3D-ABCDE", "SEED-1", "VS-XY"]) {
    const f = factionsFor(room, "a");
    assert.deepEqual(f, factionsFor(room, "a"));
    assert.ok(PROPAGANDA_IDS.includes(f.mine) && PROPAGANDA_IDS.includes(f.theirs));
    assert.notEqual(f.mine, f.theirs);
  }
  assert.equal(factionsFor("x", "a", "nox").theirs, "nox");
});

test("stationCalls names the lit and next stations 1-based", () => {
  const calls = stationCalls({ lit: 3, next: 1 });
  assert.equal(calls[0].kind, "live"); assert.equal(calls[0].station, 4);
  assert.match(calls[0].text, /STATION 4/);
  assert.equal(calls[1].kind, "next"); assert.match(calls[1].text, /STATION 2 ON AIR NEXT ROUND/);
  assert.equal(stationCalls({ lit: null, next: 0 })[0].kind, "dark");
  assert.deepEqual(stationCalls(null), []);
});

test("the first state yields only standing moments", () => {
  const kinds = momentsBetween(null, st(), "a").map((m) => m.kind);
  assert.deepEqual(kinds, ["wanted", "station"]);
});

test("momentsBetween catches re-rolls, beacons, kills and VP", () => {
  const prev = st();
  const next = st({
    rigs: [{ id: 1, name: "Copper", owner: "a", destroyed: true }, { id: 2, name: "Zebra", owner: "b" }],
    game: { round: 3, priorityTargets: { a: 5 }, beacons: { lit: 3, next: 1 }, sides: [{ id: "a", vp: 0 }, { id: "b", vp: 4 }] },
  });
  const m = momentsBetween(prev, next, "a");
  assert.equal(m.find((x) => x.kind === "wanted").rigId, 5);
  assert.ok(m.some((x) => x.kind === "station"));
  const kill = m.find((x) => x.kind === "kill");
  assert.equal(kill.name, "Copper"); assert.equal(kill.byUs, false);
  const vp = m.find((x) => x.kind === "vp");
  assert.equal(vp.side, "b"); assert.equal(vp.ours, false); assert.ok(vp.amount > 0);
  assert.deepEqual(momentsBetween(next, next, "a"), []);
});

test("pulpCover builds its headline from the real stats", () => {
  const c = pulpCover({ mvp: { name: "Copper", dmg: 11, kills: 2 }, winner: "a", side: "a", place: "Rail Yard", round: 7, vp: [9, 4] });
  assert.match(c.headline, /COPPER/);
  assert.match(c.sub, /Rail Yard/);
  assert.equal(c.tone, "win");
  assert.equal(pulpCover({ winner: null }).tone, "draw");
  const shot = pulpCover({ best: { actor: "Zebra", target: "Copper", weapon: "Mortar", sp: 5 }, winner: "b", side: "a" });
  assert.match(shot.headline, /ZEBRA/); assert.equal(shot.tone, "loss");
});

test("intertitles open, mark each new round, and end", () => {
  const t = intertitles([{ round: 1 }, { round: 1 }, { round: 2 }, { round: 3 }], "Ashfields");
  assert.equal(t[0].kind, "open"); assert.match(t[0].text, /ASHFIELDS/);
  assert.deepEqual(t.filter((x) => x.kind === "round").map((x) => x.at), [2, 3]);
  assert.equal(t[t.length - 1].text, "THE END");
});

test("whisperFor murmurs about failing legs once, then moves on", () => {
  const state = st({ rigs: [{ id: 2, name: "Zebra", owner: "b", pos: { x: 1, y: 1 }, legs: { sp: 1, max: 6 } }], game: { priorityTargets: {} } });
  const seen = new Set();
  const w = whisperFor(state, "a", seen);
  assert.match(w.text, /legs are failing/);
  seen.add(w.key);
  assert.equal(whisperFor(state, "a", seen), null);
});

test("every nature has a badge label", () => {
  for (const n of ["field", "tuned", "prototype"]) assert.ok(NATURE_LABEL[n]);
});
