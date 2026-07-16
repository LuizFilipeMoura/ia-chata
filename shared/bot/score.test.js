import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate, PRESETS } from "./score.js";
import { createRoom, claimSide, applyCommand, findRig } from "../game-state.js";
import { computeObjectives } from "../field.js";
import { HEAT_CAPACITY } from "../rules.js";

// A digital room with a mover ("Atk") and an enemy ("Foe"), real objective
// markers, Atk mid-activation and holding both weapons. Positions are the
// caller's to set. A second enemy is added on request (for the priority test).
function scoreSetup({ twoFoes = false, lr = "Autocannon" } = {}) {
  const room = createRoom("SCORE01");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "add", attrs: { name: "Atk", class: "medium", owner: "a", longRange: lr, melee: "Sword" } });
  applyCommand(room, { verb: "add", attrs: { name: "Foe", class: "medium", owner: "b", longRange: "Autocannon", melee: "Sword" } });
  if (twoFoes) applyCommand(room, { verb: "add", attrs: { name: "Foe2", class: "medium", owner: "b", longRange: "Autocannon", melee: "Sword" } });
  const atk = findRig(room, "Atk");
  const foe = findRig(room, "Foe");
  atk.pos = { x: 20, y: 18 }; atk.facing = 0;
  foe.pos = { x: 40, y: 18 }; foe.facing = 180;
  const foe2 = twoFoes ? findRig(room, "Foe2") : null;
  if (foe2) { foe2.pos = { x: 40, y: 26 }; foe2.facing = 180; }
  room.field.terrain = [];
  room.game.objectives = computeObjectives(room.field);
  room.game.phase = "activation";
  room.game.turn = { side: "a", activeRigId: atk.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  atk.loaded = { longRange: true, melee: true };
  room.game.priorityTargets = { a: foe.id, b: atk.id };
  return { room, atk, foe, foe2 };
}

test("a rear-arc shot outscores the same shot into the front", () => {
  const { room, atk } = scoreSetup();
  const base = { action: "fire", weapon: "longRange", target: "Foe", distance: 12, cover: 0 };
  const front = scoreCandidate(room, atk, { ...base, arc: "front" }, PRESETS.balanced);
  const rear  = scoreCandidate(room, atk, { ...base, arc: "rear" },  PRESETS.balanced);
  assert.ok(rear > front, `rear ${rear} should beat front ${front}`);
});

test("a machine gun will not shoot a front arc at all — Raking Fire's veto", () => {
  const { room, atk } = scoreSetup({ lr: "Mini Gun" });
  const base = { action: "fire", weapon: "longRange", target: "Foe", distance: 7, cover: 0 };
  const front = scoreCandidate(room, atk, { ...base, arc: "front" }, PRESETS.aggressive);
  const rear  = scoreCandidate(room, atk, { ...base, arc: "rear" },  PRESETS.aggressive);
  assert.ok(rear > front, "a rake earns nothing shooting a front arc");
});

test("standing on an uncontested objective outscores standing next to it", () => {
  const { room, atk, foe } = scoreSetup();
  foe.pos = { x: 52, y: 34 };   // shove the enemy far so only the objective term differs
  const mk = room.game.objectives[0];   // the centre marker
  const on   = scoreCandidate(room, atk, { action: "move", dest: { x: mk.x, y: mk.y }, facing: 0 }, PRESETS.balanced);
  const next = scoreCandidate(room, atk, { action: "move", dest: { x: mk.x + 4, y: mk.y }, facing: 0 }, PRESETS.balanced);
  assert.ok(on > next, `on-marker ${on} should beat beside-marker ${next}`);
});

test("a contested objective scores below an uncontested one", () => {
  const { room, atk, foe } = scoreSetup();
  const mk = room.game.objectives[0];
  const cand = { action: "move", dest: { x: mk.x, y: mk.y }, facing: 0 };
  foe.pos = { x: 52, y: 34 };                 // uncontested
  const uncontested = scoreCandidate(room, atk, cand, PRESETS.balanced);
  foe.pos = { x: mk.x, y: mk.y };             // enemy also holds the marker
  const contested = scoreCandidate(room, atk, cand, PRESETS.balanced);
  assert.ok(uncontested > contested, `uncontested ${uncontested} should beat contested ${contested}`);
});

test("killing the Priority Target outscores killing an identical non-priority rig", () => {
  const { room, atk } = scoreSetup({ twoFoes: true });   // priority = Foe
  const base = { action: "fire", weapon: "longRange", arc: "side", distance: 12, cover: 0 };
  const onPriority  = scoreCandidate(room, atk, { ...base, target: "Foe" },  PRESETS.balanced);
  const offPriority = scoreCandidate(room, atk, { ...base, target: "Foe2" }, PRESETS.balanced);
  assert.ok(onPriority > offPriority, `priority ${onPriority} should beat non-priority ${offPriority}`);
});

test("a move that enables a good shot outscores a move that doesn't", () => {
  const { room, atk, foe } = scoreSetup();
  foe.facing = 0;   // enemy faces away, so it can't fire back — isolates offence from exposure
  const toward = { action: "move", dest: { x: 26, y: 18 }, facing: 0 };    // closes and faces the enemy → a shot
  const away   = { action: "move", dest: { x: 16, y: 18 }, facing: 180 };  // faces away → no shot
  const s1 = scoreCandidate(room, atk, toward, PRESETS.aggressive);
  const s2 = scoreCandidate(room, atk, away,   PRESETS.aggressive);
  assert.ok(s1 > s2, `move-into-a-shot ${s1} should beat move-away ${s2}`);
});

test("a move into cover lowers exposure", () => {
  const { room, atk, foe } = scoreSetup();
  foe.pos = { x: 40, y: 18 }; foe.facing = 180;   // faces the approach
  room.game.objectives = [];   // isolate the exposure term — no marker to muddy it
  // A building that blocks the enemy's sight to the covered spot but not the open one.
  room.field.terrain = [{ kind: "building", x: 33, y: 11, shape: "rect", w: 8, h: 6 }];  // spans y 8–14
  const open  = { action: "move", dest: { x: 26, y: 18 }, facing: 90 };   // faces south → Atk itself can't fire; isolates exposure
  const cover = { action: "move", dest: { x: 26, y: 6 },  facing: 90 };   // behind the building from the enemy
  const sOpen  = scoreCandidate(room, atk, open,  PRESETS.cagey);
  const sCover = scoreCandidate(room, atk, cover, PRESETS.cagey);
  assert.ok(sCover > sOpen, `cover ${sCover} should beat open ${sOpen}`);
});

test("an action that would overheat scores below one that doesn't", () => {
  const { room, atk, foe, } = scoreSetup();
  foe.destroyed = true;                       // no enemies: isolate the heat term
  atk.pos = { x: 6, y: 6 };                   // far from every marker: no vp either
  atk.engine.heat = HEAT_CAPACITY[atk.weightClass];   // sitting at the cap
  const sprint = { action: "sprint", dest: { x: 9, y: 6 }, facing: 0 };   // adds heat → over the cap
  const hold   = { action: "move",   dest: { x: 6, y: 6 }, facing: 0 };   // 0" pivot, no heat
  const sSprint = scoreCandidate(room, atk, sprint, PRESETS.balanced);
  const sHold   = scoreCandidate(room, atk, hold,   PRESETS.balanced);
  assert.ok(sHold > sSprint, `hold ${sHold} should beat overheating sprint ${sSprint}`);
});

test("PRESETS.aggressive weights damage above vp; PRESETS.cagey the reverse", () => {
  assert.ok(PRESETS.aggressive.damage > PRESETS.aggressive.vp, "aggressive prizes damage");
  assert.ok(PRESETS.cagey.vp > PRESETS.cagey.damage, "cagey prizes vp");
});
