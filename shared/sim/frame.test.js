import { test } from "node:test";
import assert from "node:assert/strict";
import { frameOf } from "./match.js";

// The replay paints planted flags and beacon holders from frames, so a frame
// must carry each rig's plant.
test("a replay frame keeps each rig's planted flag", () => {
  const room = {
    game: { round: 3, phase: "activation", turn: null, sides: [{ vp: 0 }, { vp: 4 }], beacons: { lit: 1, next: 0 }, resolutions: [] },
    rigs: [
      { id: 1, owner: "a", pos: { x: 10, y: 10 }, plant: { objective: 1, at: { x: 10, y: 10 } } },
      { id: 2, owner: "b", pos: { x: 30, y: 10 } },
    ],
  };
  const f = frameOf(room, null, 0);
  assert.deepEqual(f.beacons, { lit: 1, next: 0 });
  assert.deepEqual(f.rigs[0].plant, { objective: 1, at: { x: 10, y: 10 } });
  assert.equal(f.rigs[1].plant, null);
});
