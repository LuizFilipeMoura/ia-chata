// Where a bot puts its squadron in the deploy phase (§10). Every legal spot in
// the zone (a lattice over the quarter disc) is scored per rig, biggest base
// first like autoDeploy, and the rig takes the best one. Three evolvable genes
// shape the score (the GA breeds them with the rest of the pilot):
//   d_forward  how far out toward the zone's rim to stand (negative hangs back)
//   d_beacon   how hard to lean toward the telegraphed Next beacon (the one
//              that lights in round 2), else the table centre
//   d_spread   how much to keep bases apart, so one splash can't catch two
// The planner reads the engine's own legality test, so every plan it returns
// is one the deploy verb accepts.
import { deployZone, deploySpotLegal } from "../game-state.js";
import { radiusOf } from "../geometry.js";

export const DEPLOY_GENES = ["d_forward", "d_beacon", "d_spread"];
export const DEPLOY_DEFAULTS = { d_forward: 0.6, d_beacon: 1, d_spread: 1 };
// Rim gap (inches) past which spreading further earns nothing: a little more
// than the widest splash ring.
const SPREAD_GAP = 4;
const STEPS = 16;

const gene = (w, k) => (Number.isFinite(w?.[k]) ? w[k] : DEPLOY_DEFAULTS[k]);

// → [{ name, x, y, facing }] for every living unit of `side` with a position.
export function planDeployment(room, side, weights) {
  const { corner, radius } = deployZone(room, side);
  const centre = { x: room.field.width / 2, y: room.field.height / 2 };
  const b = room.game.beacons;
  const marker = b && b.next != null ? room.game.objectives?.[b.next] : null;
  const goal = marker ? { x: marker.x, y: marker.y } : centre;
  const fwd = gene(weights, "d_forward"), lean = gene(weights, "d_beacon"), spread = gene(weights, "d_spread");
  const sx = corner.x < centre.x ? 1 : -1, sy = corner.y < centre.y ? 1 : -1;
  const round2 = (n) => Math.round(n * 100) / 100;
  const cells = [];
  for (let ix = 0; ix <= STEPS; ix++) {
    for (let iy = 0; iy <= STEPS; iy++) {
      const p = { x: round2(corner.x + sx * ix * radius / STEPS), y: round2(corner.y + sy * iy * radius / STEPS) };
      if (Math.hypot(p.x - corner.x, p.y - corner.y) <= radius) cells.push(p);
    }
  }
  const mine = room.rigs.map((rig, i) => ({ rig, i }))
    .filter(({ rig }) => (rig.owner || "a") === side && !rig.destroyed && rig.pos)
    .sort((a, c) => radiusOf(c.rig) - radiusOf(a.rig) || a.i - c.i);
  const others = room.rigs.filter((r) => (r.owner || "a") !== side);
  const placed = [];
  const plan = [];
  for (const { rig } of mine) {
    const r = radiusOf(rig);
    let best = null;
    for (const p of cells) {
      if (!deploySpotLegal(room, rig, p, [...others, ...placed])) continue;
      const out = Math.hypot(p.x - corner.x, p.y - corner.y) / radius;
      const toGoal = Math.hypot(p.x - goal.x, p.y - goal.y) / radius;
      const gap = placed.length ? Math.min(...placed.map((q) => Math.hypot(q.pos.x - p.x, q.pos.y - p.y) - r - radiusOf(q))) : SPREAD_GAP;
      const s = fwd * out - lean * toGoal + spread * Math.min(1, gap / SPREAD_GAP);
      if (!best || s > best.s + 1e-9) best = { p, s };
    }
    // No legal lattice cell (a packed zone): leave the rig where autoDeploy put it.
    const p = best ? best.p : rig.pos;
    placed.push({ ...rig, pos: p });
    plan.push({ name: rig.name, x: p.x, y: p.y, facing: Math.round(Math.atan2(goal.y - p.y, goal.x - p.x) * 180 / Math.PI) });
  }
  return plan;
}
