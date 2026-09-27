import { test } from "node:test";
import assert from "node:assert/strict";
import { beaconStates } from "./beacon-state.js";

const objs = [{ x: 10, y: 10, vp: 2 }, { x: 30, y: 10, vp: 1 }, { x: 10, y: 30, vp: 1 }];
const rig = (owner, x, y, plant = null) => ({ owner, pos: { x, y }, radius: 1, kind: "rig", weightClass: "light", plant });

test("lit, next and dark states, holder from a planted rig", () => {
  const s = beaconStates(objs, { lit: 0, next: 2 }, [rig("a", 10, 10, { objective: 0, at: { x: 10, y: 10 } })]);
  assert.deepEqual(s.map((x) => x.state), ["lit", "dark", "next"]);
  assert.equal(s[0].holder, "a");
});

test("an enemy within 2 inches makes the lit beacon contested", () => {
  const s = beaconStates(objs, { lit: 0, next: 2 }, [rig("a", 10, 10, { objective: 0, at: { x: 10, y: 10 } }), rig("b", 12, 10)]);
  assert.equal(s[0].holder, "contested");
});

test("classic rooms keep raw control", () => {
  const s = beaconStates(objs, null, [rig("b", 30, 10)]);
  assert.equal(s[1].state, "classic");
  assert.equal(s[1].holder, "b");
});
