import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKER_PROTOCOL, PLAYER_START_GUIDE } from "./prompt.js";
import { MAX_RIGS_PER_SIDE, MAX_RIGS_TOTAL, WEAPONS } from "../shared/game-state.js";

test("tracker protocol documents structured strict weapon add flow", () => {
  assert.match(TRACKER_PROTOCOL, /class="<class: light\|medium>"/);
  assert.match(TRACKER_PROTOCOL, /lr="<long-range weapon>"/);
  assert.match(TRACKER_PROTOCOL, /melee="<melee weapon>"/);
  assert.doesNotMatch(TRACKER_PROTOCOL, /RIG weapons/);
  assert.doesNotMatch(TRACKER_PROTOCOL, /heavy\|colossal/);
  assert.match(TRACKER_PROTOCOL, /ask for every\s+missing field/i);
  assert.match(TRACKER_PROTOCOL, /emit no `\[\[RIG add\]\]` tag/i);
  assert.match(TRACKER_PROTOCOL, /Heavy and Colossal Rigs are not available/i);
  assert.match(TRACKER_PROTOCOL, new RegExp(Object.keys(WEAPONS.longRange).join(".*"), "s"));
  assert.match(TRACKER_PROTOCOL, new RegExp(Object.keys(WEAPONS.melee).join(".*"), "s"));
});

test("tracker protocol documents hard rig add limits", () => {
  assert.match(TRACKER_PROTOCOL, new RegExp(`${MAX_RIGS_PER_SIDE} Rigs per side`, "i"));
  assert.match(TRACKER_PROTOCOL, new RegExp(`${MAX_RIGS_TOTAL} Rigs total`, "i"));
  assert.match(TRACKER_PROTOCOL, /emit no `\[\[RIG add\]\]` tag/i);
});

test("player start guide documents one-player guided rig registration", () => {
  assert.match(PLAYER_START_GUIDE, /one player at a time/i);
  assert.match(PLAYER_START_GUIDE, /current player's side/i);
  assert.match(PLAYER_START_GUIDE, /3 complete own-side Rigs/i);
  assert.match(PLAYER_START_GUIDE, /Light or Medium/i);
});

test("player start guide requires strict weapon disambiguation before creating rigs", () => {
  assert.match(PLAYER_START_GUIDE, /2-3 likely legal matches/i);
  assert.match(PLAYER_START_GUIDE, /glued/i);
  assert.match(PLAYER_START_GUIDE, /Do not emit.*\[\[RIG add/s);
  assert.match(PLAYER_START_GUIDE, new RegExp(Object.keys(WEAPONS.longRange).join(".*"), "s"));
  assert.match(PLAYER_START_GUIDE, new RegExp(Object.keys(WEAPONS.melee).join(".*"), "s"));
});

test("player start guide hands off to deployment after registration", () => {
  assert.match(PLAYER_START_GUIDE, /terrain/i);
  assert.match(PLAYER_START_GUIDE, /three objectives/i);
  assert.match(PLAYER_START_GUIDE, /deploy/i);
  assert.match(PLAYER_START_GUIDE, /score objectives/i);
});

test("tracker protocol teaches Tank and Walker add grammar", () => {
  assert.match(TRACKER_PROTOCOL, /kind="rig"/);
  assert.match(TRACKER_PROTOCOL, /kind="tank"/);
  assert.match(TRACKER_PROTOCOL, /kind="walker"/);
  assert.match(TRACKER_PROTOCOL, /unit="<flat unit weapon>"/);
});

test("tracker protocol documents kind-specific loc enums", () => {
  assert.match(TRACKER_PROTOCOL, /rig.*hull\|arms\|legs\|engine/i);
  assert.match(TRACKER_PROTOCOL, /tank.*hull\|tracks\|turret\|engine/i);
  assert.match(TRACKER_PROTOCOL, /walker.*hull\|legs\|mount\|engine/i);
});

test("tracker protocol lists the flat unit-weapon catalogue", () => {
  const names = ["Tank Cannon", "Autocannon Mount", "Coaxial MG", "Rocket Pod", "Dozer Blade", "Ram Spike"];
  for (const n of names) {
    assert.ok(TRACKER_PROTOCOL.includes(n), `TRACKER_PROTOCOL mentions ${n}`);
  }
});
