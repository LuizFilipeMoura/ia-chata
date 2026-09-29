import { test } from "node:test";
import assert from "node:assert/strict";
import { activationOrder } from "./frieze.js";

const rig = (id, owner, extra = {}) => ({ id, owner, ...extra });

test("waiting rigs alternate from the side on the floor", () => {
  const rigs = [rig(1, "a"), rig(2, "a"), rig(3, "b"), rig(4, "b")];
  assert.deepEqual(activationOrder(rigs, "b").seq.map((r) => r.owner), ["b", "a", "b", "a"]);
  assert.deepEqual(activationOrder(rigs, "a").seq.map((r) => r.owner), ["a", "b", "a", "b"]);
});

test("a side that runs out lets the other finish its activations", () => {
  const rigs = [rig(1, "a"), rig(2, "a"), rig(3, "a"), rig(4, "b")];
  assert.deepEqual(activationOrder(rigs, "a").seq.map((r) => r.owner), ["a", "b", "a", "a"]);
});

test("rigs that acted go to the done list; wrecks drop out entirely", () => {
  const rigs = [rig(1, "a", { activated: true }), rig(2, "a", { destroyed: true }), rig(3, "b")];
  const { seq, done } = activationOrder(rigs, "a");
  assert.deepEqual(seq.map((r) => r.id), [3]);
  assert.deepEqual(done.map((r) => r.id), [1]);
});

test("a rig with no owner counts as side A", () => {
  assert.equal(activationOrder([rig(1, undefined)], "a").seq.length, 1);
});
