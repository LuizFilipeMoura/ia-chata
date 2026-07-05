import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKER_PROTOCOL } from "./prompt.js";
import { WEAPONS } from "../shared/game-state.js";

test("tracker protocol documents structured strict weapon add flow", () => {
  assert.match(TRACKER_PROTOCOL, /class="<class: light\|medium>"/);
  assert.match(TRACKER_PROTOCOL, /lr="<long-range weapon>"/);
  assert.match(TRACKER_PROTOCOL, /melee="<melee weapon>"/);
  assert.doesNotMatch(TRACKER_PROTOCOL, /RIG weapons/);
  assert.doesNotMatch(TRACKER_PROTOCOL, /heavy\|colossal/);
  assert.match(TRACKER_PROTOCOL, /ask for every\s+missing field/i);
  assert.match(TRACKER_PROTOCOL, /emit no `\[\[RIG add\]\]` tag/i);
  assert.match(TRACKER_PROTOCOL, /Heavy and Colossal Rigs are not available/i);
  assert.match(TRACKER_PROTOCOL, new RegExp(WEAPONS.longRange.join(".*"), "s"));
  assert.match(TRACKER_PROTOCOL, new RegExp(WEAPONS.melee.join(".*"), "s"));
});
