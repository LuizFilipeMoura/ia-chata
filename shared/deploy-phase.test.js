// Digital deploy phase (§10): after both sides ready, the engine drops each
// squadron legally in its corner, then each commander may re-place its own rigs
// anywhere inside its zone (and set facing) before confirming. Round 1 opens
// only once both sides have confirmed.
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, claimSide, applyCommand, lastRejectionReason, findRig, deployZone, deploySpotLegal } from "./game-state.js";
import { radiusOf } from "./geometry.js";
import { driveBots } from "./bot/index.js";
import { planDeployment } from "./bot/deploy.js";
import { mulberry32 } from "./sim/match.js";
import { enforceChassis } from "./commission.js";

const SQUAD_A = ["light-claw-autocannon", "medium-lance-mortar"];
const SQUAD_B = ["light-missile-flamethrower", "medium-sniper-chainsaw"];

function room({ bot = null } = {}) {
  const r = createRoom("DEP-T");
  const opts = { random: mulberry32(7) };
  claimSide(r, { name: "Cyan", side: "a" });
  claimSide(r, { name: "Red", side: "b" });
  applyCommand(r, { verb: "mode", attrs: { mode: "digital" } }, { side: "a" }, opts);
  if (bot) applyCommand(r, { verb: "setbot", attrs: { side: "b", preset: bot } }, { side: "a" }, opts);
  for (const [owner, ids] of [["a", SQUAD_A], ["b", bot ? [] : SQUAD_B]]) {
    for (const chassis of ids) applyCommand(r, enforceChassis({ verb: "add", attrs: { name: chassis, kind: "rig", owner, chassis } }).cmd, { side: owner }, opts);
  }
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" }, opts);
  applyCommand(r, { verb: "ready", attrs: {} }, { side: "a" }, opts);
  if (!bot) applyCommand(r, { verb: "ready", attrs: {} }, { side: "b" }, opts);
  return r;
}
const cmd = (r, verb, attrs, side) => { const v = r.version; applyCommand(r, { verb, attrs }, { side }, { random: mulberry32(9) }); return r.version !== v; };
const mine = (r, side) => r.rigs.filter((x) => x.owner === side);

test("readying a digital room opens the deploy phase with both squadrons already on the table", () => {
  const r = room();
  assert.equal(r.game.started, true);
  assert.equal(r.game.phase, "deploy");
  assert.equal(r.game.turn, null);
  for (const rig of r.rigs) assert.ok(rig.pos, `${rig.name} placed`);
  // Round 1's Next beacon is already telegraphed, so it can shape the deployment.
  assert.ok(Number.isInteger(r.game.beacons?.next));
});

test("a rig can be re-placed anywhere legal in its own zone, with a facing", () => {
  const r = room();
  const rig = mine(r, "a")[0];
  const { corner, radius } = deployZone(r, "a");
  // Straight out from the corner along the diagonal toward the table centre.
  const cx = r.field.width / 2, cy = r.field.height / 2;
  const len = Math.hypot(cx - corner.x, cy - corner.y);
  r.field.terrain = [];
  let spot = null;
  for (let d = radius; d > 2 && !spot; d -= 0.25) {
    const p = { x: +(corner.x + (cx - corner.x) / len * d).toFixed(2), y: +(corner.y + (cy - corner.y) / len * d).toFixed(2) };
    if (deploySpotLegal(r, rig, p, r.rigs.filter((x) => x !== rig))) spot = p;
  }
  assert.ok(spot, "some legal spot on the diagonal");
  assert.ok(cmd(r, "deploy", { name: rig.name, x: spot.x, y: spot.y, facing: 45 }, "a"), lastRejectionReason());
  assert.deepEqual(rig.pos, spot);
  assert.equal(rig.facing, 45);
});

test("deploy rejects a spot outside the zone, an enemy rig, and the other side's zone", () => {
  const r = room();
  const rig = mine(r, "a")[0];
  assert.equal(cmd(r, "deploy", { name: rig.name, x: r.field.width / 2, y: r.field.height / 2 }, "a"), false);
  assert.match(lastRejectionReason(), /zone/i);
  const foe = mine(r, "b")[0];
  assert.equal(cmd(r, "deploy", { name: foe.name, x: foe.pos.x, y: foe.pos.y }, "a"), false);
  const { corner } = deployZone(r, "b");
  assert.equal(cmd(r, "deploy", { name: rig.name, x: corner.x + (corner.x ? -2 : 2), y: corner.y + (corner.y ? -2 : 2) }, "a"), false);
});

test("deploy rejects a spot on top of another base", () => {
  const r = room();
  const [one, two] = mine(r, "a");
  assert.equal(cmd(r, "deploy", { name: one.name, x: two.pos.x, y: two.pos.y }, "a"), false);
});

test("a batch deploy is judged as a whole, so two rigs can swap places", () => {
  const r = room();
  const [one, two] = mine(r, "a");
  const p1 = { ...one.pos }, p2 = { ...two.pos };
  // Same-size swap only makes sense if both bases fit either spot: use the bigger radius.
  assert.ok(deploySpotLegal(r, one, p2, r.rigs.filter((x) => x !== one && x !== two)));
  assert.ok(cmd(r, "deploy", { placements: [{ name: one.name, x: p2.x, y: p2.y }, { name: two.name, x: p1.x, y: p1.y }] }, "a"), lastRejectionReason());
  assert.deepEqual(one.pos, p2);
  assert.deepEqual(two.pos, p1);
});

test("round 1 opens only when both sides confirm, with the usual initiative", () => {
  const r = room();
  assert.ok(cmd(r, "deployed", {}, "a"), lastRejectionReason());
  assert.equal(r.game.phase, "deploy");
  // A confirmed side is locked in.
  assert.equal(cmd(r, "deploy", { name: mine(r, "a")[0].name, x: mine(r, "a")[0].pos.x, y: mine(r, "a")[0].pos.y }, "a"), false);
  assert.ok(cmd(r, "deployed", {}, "b"), lastRejectionReason());
  assert.equal(r.game.phase, "activation");
  assert.equal(r.game.round, 1);
  // a readied first: a is the first-deployer and so activates second (§10.5).
  assert.equal(r.game.turn.side, "b");
  assert.equal(r.game.answerTokens.a, 1);
});

test("no activating or acting during deployment", () => {
  const r = room();
  assert.equal(cmd(r, "activate", { name: mine(r, "a")[0].name }, "a"), false);
});

test("a bot opponent deploys and confirms on its own; the human still owes theirs", () => {
  const r = room({ bot: "normal" });
  assert.equal(r.game.phase, "deploy");
  driveBots(r, { random: mulberry32(3) });
  assert.equal(r.game.deploy.done.b, true);
  assert.equal(r.game.deploy.done.a, false);
  assert.equal(r.game.phase, "deploy");
  cmd(r, "deployed", {}, "a");
  assert.equal(r.game.phase, "activation");
});

test("the bot's plan keeps every rig legal, spread out, and leaning toward the Next beacon", () => {
  const r = room({ bot: "normal" });
  const plan = planDeployment(r, "b", { d_forward: 0, d_beacon: 2, d_spread: 1 });
  const rigs = mine(r, "b");
  assert.equal(plan.length, rigs.length);
  const placed = [];
  for (const p of plan) {
    const rig = findRig(r, p.name);
    const others = r.rigs.filter((x) => x.owner !== "b").concat(placed);
    assert.ok(deploySpotLegal(r, rig, p, others), `${p.name} legal at ${p.x},${p.y}`);
    placed.push({ ...rig, pos: { x: p.x, y: p.y } });
  }
  // Leaning on the beacon beats the corner-hugging opposite.
  const next = r.game.objectives[r.game.beacons.next];
  const back = planDeployment(r, "b", { d_forward: -2, d_beacon: 0, d_spread: 0 });
  const avg = (pl) => pl.reduce((n, p) => n + Math.hypot(p.x - next.x, p.y - next.y), 0) / pl.length;
  assert.ok(avg(plan) < avg(back));
  for (let i = 0; i < plan.length; i++) {
    for (let j = i + 1; j < plan.length; j++) {
      const a = findRig(r, plan[i].name), b = findRig(r, plan[j].name);
      assert.ok(Math.hypot(plan[i].x - plan[j].x, plan[i].y - plan[j].y) >= radiusOf(a) + radiusOf(b));
    }
  }
});

test("seeded test battles skip deployment", () => {
  const r = createRoom("SEED-DEP");
  applyCommand(r, { verb: "seed", attrs: { first: "a" } });
  assert.equal(r.game.phase, "activation");
});

test("a campaign contract played with `deploy` opens the deploy phase; a scripted one starts at once", () => {
  const attrs = { type: "skirmish", seed: 3, enemyBot: "normal", squads: {
    a: [{ name: "Gold", chassis: "light-claw-autocannon" }],
    b: [{ name: "Red", chassis: "light-missile-flamethrower" }],
  } };
  const played = createRoom("CAMP-DEP");
  applyCommand(played, { verb: "mission", attrs: { ...attrs, deploy: true } });
  assert.equal(played.game.phase, "deploy");
  driveBots(played, { random: mulberry32(1) });
  assert.equal(played.game.deploy.done.b, true);
  cmd(played, "deployed", {}, "a");
  assert.notEqual(played.game.phase, "deploy");
  const scripted = createRoom("CAMP-NODEP");
  applyCommand(scripted, { verb: "mission", attrs });
  assert.notEqual(scripted.game.phase, "deploy");
});
