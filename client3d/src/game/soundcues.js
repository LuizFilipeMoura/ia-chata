// Battle audio cues read off consecutive director frames: the air-raid siren
// at a new round, a steam whistle when the turn passes, the active unit's
// diesel idling (rougher as it heats), the klaxon when a rig reaches heat
// capacity, a far-off thud when an enemy activates, hull groans from mediums,
// and the gramophone drifting into static as the player's rig runs hot.
import { sfx, engine } from "../audio.js";
import { music } from "../music.js";
import { HEAT_CAPACITY } from "/shared/rules.js";

const capOf = (d, r) => HEAT_CAPACITY[d.mechs.get(r.id)?.weightClass] ?? 6;

// Is this mech on screen right now?
function inView(d, m) {
  const cam = d.world?.camera;
  if (!cam || !m?.root) return true;
  const v = m.root.position.clone().project(cam);
  return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
}

export function battleCues(d, frame, prev) {
  if (d.quiet || d.skipping || d.detached || !prev) return;
  const rigs = new Map(frame.rigs.map((r) => [r.id, r]));
  const before = new Map(prev.rigs.map((r) => [r.id, r]));

  // Round and turn.
  const newRound = frame.round && frame.round !== prev.round;
  if (newRound) sfx.siren();
  else if (frame.turn?.side && prev.turn?.side && frame.turn.side !== prev.turn.side) sfx.whistle();

  // Whoever is acting: the active unit, else the last unit in this frame's log.
  const activeId = frame.turn?.activeRigId ?? null;
  const actorId = activeId ?? [...(frame.log || [])].reverse().find((l) => rigs.has(l.rigId))?.rigId ?? null;
  const actor = rigs.get(actorId);
  if (actor && actorId !== d.lastActorId && !actor.destroyed) {
    const m = d.mechs.get(actorId);
    if (actor.owner !== d.side) sfx.distantThud(inView(d, m) ? 0.45 : 1);
    if (m?.weightClass === "medium" && Math.random() < 0.5) setTimeout(() => sfx.groan(0.8), 250);
  }
  d.lastActorId = actorId;

  // The active unit's engine idles until its activation ends.
  const active = rigs.get(activeId);
  if (active && !active.destroyed && (active.kind || "rig") !== "drone") {
    engine.idle(active.chassis || active.kind || "light", active.heat / capOf(d, active), { level: active.owner === d.side ? 1 : 0.6 });
  } else engine.stop();

  // Heat: the klaxon when a rig reaches capacity; hulls groan when hurt.
  let groaned = false;
  for (const r of frame.rigs) {
    const p = before.get(r.id);
    if (!p || r.destroyed || (r.kind || "rig") !== "rig") continue;
    const cap = capOf(d, r);
    if (r.heat >= cap && p.heat < cap) sfx.klaxon();
    const hp = (x) => (Number.isFinite(x.integrity) ? x.integrity : Object.values(x.sp || {}).reduce((a, v) => a + (v?.[0] || 0), 0));
    if (!groaned && d.mechs.get(r.id)?.weightClass === "medium" && hp(r) < hp(p) && Math.random() < 0.6) {
      groaned = true;
      setTimeout(() => sfx.groan(1), 500);
    }
  }

  // The radio: the player's active rig if it's acting, else their hottest.
  const mine = frame.rigs.filter((r) => r.owner === d.side && !r.destroyed && (r.kind || "rig") === "rig");
  const heatFrac = active && active.owner === d.side ? active.heat / capOf(d, active) : Math.max(0, ...mine.map((r) => r.heat / capOf(d, r)));
  music.setHeat(heatFrac);
}

// Screen closed or reset: no engine left idling, the radio back on station.
export function stopCues(d) {
  engine.stop();
  music.setHeat(0);
  if (d) d.lastActorId = null;
}
