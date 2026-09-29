import { test } from "node:test";
import assert from "node:assert/strict";
import { lampState, grimeLevels, grimeLook, clutterPick, CLUTTER, noseArtFor, NOSE_ART, nicknameFor, unitNumber, exhaustFor, isSprint, comicWord, COMIC_WORDS } from "./look.js";

test("lamp: amber idle, red fighting, green faulted, dead when destroyed", () => {
  assert.equal(lampState({}), "amber");
  assert.equal(lampState({ engaged: true }), "red");
  assert.equal(lampState({ active: true }), "red");
  for (const f of ["stalled", "jammed", "shutdown"]) assert.equal(lampState({ [f]: true }), "green", f);
  assert.equal(lampState({ engaged: true, jammed: true }), "green", "a fault outranks a standing fight");
  assert.equal(lampState({ attacking: true, jammed: true }), "red", "the swing itself flashes red");
  assert.equal(lampState({ destroyed: true, attacking: true }), "dead");
});

test("grime rises as a location's SP drops, per location", () => {
  const g = grimeLevels({ hull: [10, 10], arms: [5, 10], legs: [0, 10], engine: [8, 10] });
  assert.equal(g.hull, 0);
  assert.ok(g.arms > g.engine && g.legs > g.arms);
  assert.equal(grimeLevels({ mount: [2, 8] }).arms > 0, true, "a walker's mount dirties like arms");
  let prev = grimeLook(0);
  assert.equal(prev.bits, 0); assert.equal(prev.darken, 0);
  for (const l of [0.2, 0.5, 0.8, 1]) {
    const cur = grimeLook(l);
    assert.ok(cur.darken > prev.darken && cur.bits >= prev.bits, `more damage, more grime at ${l}`);
    prev = cur;
  }
});

test("clutter: seeded per rig, none when factory fresh, 1 to 3 distinct pieces when lived in", () => {
  assert.deepEqual(clutterPick("r1", "factory"), []);
  assert.equal(clutterPick("r1", "ace").length, 1);
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const p = clutterPick(`rig-${i}`, "refit");
    assert.ok(p.length >= 1 && p.length <= 3);
    assert.equal(new Set(p).size, p.length);
    p.forEach((x) => { assert.ok(CLUTTER.includes(x)); seen.add(x); });
    assert.deepEqual(p, clutterPick(`rig-${i}`, "refit"));
  }
  assert.ok(seen.size > 3, "different rigs carry different kit");
});

test("nose art and nickname are stable per rig and varied across rigs", () => {
  assert.equal(noseArtFor("x"), noseArtFor("x"));
  assert.ok(new Set(Array.from({ length: 40 }, (_, i) => noseArtFor(`r${i}`))).size > 3);
  assert.ok(NOSE_ART.includes(noseArtFor("y")));
  assert.match(nicknameFor("Gold", "r1"), /GOLD/);
  assert.equal(nicknameFor("Gold", "r1"), nicknameFor("Gold", "r1"));
});

test("unit numbers are two stable digits", () => {
  assert.match(unitNumber("a-3"), /^\d\d$/);
  assert.match(unitNumber("zzz"), /^\d\d$/);
  assert.equal(unitNumber("zzz"), unitNumber("zzz"));
  assert.notEqual(unitNumber("a-3"), unitNumber("a-4"));
});

test("exhaust: calm when cool, thin near capacity, a sprint belches, crippled trails heavier", () => {
  assert.equal(exhaustFor({ heatFrac: 0.2 }).rate, 0);
  const hot = exhaustFor({ heatFrac: 0.95 }), hotter = exhaustFor({ heatFrac: 1.3 });
  assert.ok(hot.rate > 0 && hotter.rate > hot.rate);
  const sprint = exhaustFor({ sprinting: true });
  assert.ok(sprint.rate > hot.rate);
  const crip = exhaustFor({ crippled: true }), fine = exhaustFor({});
  assert.ok(crip.rate > fine.rate && crip.dark > hot.dark && crip.size > fine.size);
  assert.equal(exhaustFor({ destroyed: true, sprinting: true }).rate, 0);
});

test("sprint detection: the command wins, else distance past Speed or a 2-heat move", () => {
  assert.equal(isSprint({ cmd: { attrs: { action: "sprint" } }, dist: 1 }), true);
  assert.equal(isSprint({ cmd: { attrs: { action: "move" } }, dist: 50 }), false);
  assert.equal(isSprint({ dist: 8, speed: 6 }), true);
  assert.equal(isSprint({ dist: 4, speed: 6 }), false);
  assert.equal(isSprint({ dist: 4, speed: 6, heatDelta: 2 }), true);
  assert.equal(isSprint({ dist: 4, speed: 6, heatDelta: 2, attacked: true }), false);
});

test("comic words: deflections clang, blasts boom, blades screech, bigger hits print bigger", () => {
  assert.equal(comicWord({ deflected: true }).word, "CLANG");
  assert.equal(comicWord({ kind: "missile", sp: 3 }).word, "BOOM");
  assert.equal(comicWord({ melee: true, weapon: "Circular Saw", sp: 3 }).word, "SKREE");
  assert.equal(comicWord({ melee: true, weapon: "Wrecking Ball", sp: 3 }).word, "WHUMP");
  assert.ok(comicWord({ kind: "bullet", sp: 7 }).scale > comicWord({ kind: "bullet", sp: 1 }).scale);
  for (const k of ["bullet", "cannon", "missile", "lob", "rail", "arc", "bolt", "steam", "flare"]) assert.ok(COMIC_WORDS.includes(comicWord({ kind: k, sp: 4 }).word));
});
