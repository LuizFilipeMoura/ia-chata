import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedHits } from "./evaluate.js";
import { makeRig } from "../game-state.js";

// Rigs MUST be built through makeRig(id, name, cls, owner, weapons).
// normalizeWeaponUpgrade forces the field upgrade for a null id, so a
// hand-assembled weapon is a loadout the game cannot commission — a fixture
// built that way tests something that does not exist.
const atk = (lr = "Autocannon") => makeRig(1, "Atk", "medium", "a", { longRange: lr, melee: "Sword" });
const def = () => makeRig(2, "Def", "medium", "b", { longRange: "Autocannon", melee: "Sword" });

test("expectedHits is zero for an earned zero — a rake into a front arc", () => {
  const a = atk("Mini Gun");   // Mini Gun carries Raking Fire
  assert.equal(expectedHits(a, def(), "longRange", { arc: "front", distance: 7, cover: 0, round: 1 }), 0);
});

test("a rake still scores into the side and rear", () => {
  const a = atk("Mini Gun");
  const opts = { distance: 7, cover: 0, round: 1 };
  assert.ok(expectedHits(a, def(), "longRange", { ...opts, arc: "side" }) > 0);
  assert.ok(expectedHits(a, def(), "longRange", { ...opts, arc: "rear" }) > 0);
});

test("rear outscores side outscores front — the flanking ordering", () => {
  const a = atk();
  const opts = { distance: 12, cover: 0, round: 1 };
  const front = expectedHits(a, def(), "longRange", { ...opts, arc: "front" });
  const side  = expectedHits(a, def(), "longRange", { ...opts, arc: "side" });
  const rear  = expectedHits(a, def(), "longRange", { ...opts, arc: "rear" });
  assert.ok(rear > side && side > front, `expected rear>side>front, got ${rear}/${side}/${front}`);
});

test("expectedHits falls off away from the weapon's sweet spot", () => {
  const a = atk();   // Autocannon: sweet 12
  const at = (d) => expectedHits(a, def(), "longRange", { arc: "front", distance: d, cover: 0, round: 1 });
  assert.ok(at(12) > at(24), "sweet spot beats long range");
  assert.ok(at(12) > at(2), "sweet spot beats point blank");
});

test("expectedHits drops with cover", () => {
  const a = atk();
  const opts = { arc: "front", distance: 12, round: 1 };
  assert.ok(expectedHits(a, def(), "longRange", { ...opts, cover: 0 })
          > expectedHits(a, def(), "longRange", { ...opts, cover: 2 }));
});

test("a natural 6 always hits — expectedHits never falls to zero on a legal shot", () => {
  const a = atk();
  // Absurd penalties: max cover at a terrible range. A natural 6 still lands.
  const h = expectedHits(a, def(), "longRange", { arc: "front", distance: 26, cover: 2, round: 1 });
  assert.ok(h > 0, "a legal shot can never score zero expected hits");
});

test("a raised shield that negates the arc is an earned zero", () => {
  const a = atk();
  const target = def();
  target.preparation = { type: "raise-shield", source: "action", faceUp: false };
  // Default shield negates the front arc; side/rear are only blunted, so they
  // still land. (shieldCoverage in rules.js.)
  const opts = { distance: 12, cover: 0, round: 1 };
  assert.equal(expectedHits(a, target, "longRange", { ...opts, arc: "front" }), 0, "front negated");
  assert.ok(expectedHits(a, target, "longRange", { ...opts, arc: "side" }) > 0, "side only blunted");
});
