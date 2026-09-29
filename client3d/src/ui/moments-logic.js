// Pure logic behind the battle's "moments" (poster slams, the wanted poster,
// radio-station beacon calls, the pulp recap, newsreel cards, the whisper
// voice). No DOM, no /shared imports: node --test runs it directly. Pure
// flavour: nothing here decides a rule, it only reads state to dress it up.
import { PROPAGANDA_IDS } from "../propaganda.js";

// Upgrade natures as the quartermaster stamps them (badge labels only; the
// rules still call them Field / Tuned / Prototype).
export const NATURE_LABEL = { field: "FACTORY STOCK", tuned: "FIELD-MODIFIED", prototype: "WORKSHOP PROTOTYPE" };

export function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str ?? "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// Which faction's posters each side flies. The campaign enemy keeps its own
// faction; otherwise a stable pick per room. Always two different factions.
export function factionsFor(room, side, enemyFaction = null) {
  const ids = PROPAGANDA_IDS;
  const theirs = ids.includes(enemyFaction) ? enemyFaction : ids[hashSeed(`${room}:${side === "a" ? "b" : "a"}`) % ids.length];
  let mine = ids[hashSeed(`${room}:${side}`) % ids.length];
  if (mine === theirs) mine = ids[(ids.indexOf(mine) + 1) % ids.length];
  return { mine, theirs };
}

// Station numbers are the beacon's position in the objective list, 1-based,
// so a player can match the call sign to the marker on the minimap.
export const stationOf = (i) => (i == null ? null : i + 1);

// Radio calls for a cycling-beacons state: the lit beacon is "on air", the
// telegraphed one is "on air next round".
export function stationCalls(beacons) {
  if (!beacons) return [];
  const out = [];
  if (beacons.lit != null) out.push({ kind: "live", station: stationOf(beacons.lit), text: `STATION ${stationOf(beacons.lit)} NOW BROADCASTING` });
  else out.push({ kind: "dark", station: null, text: "ALL STATIONS DARK" });
  if (beacons.next != null) out.push({ kind: "next", station: stationOf(beacons.next), text: `STATION ${stationOf(beacons.next)} ON AIR NEXT ROUND` });
  return out;
}

const vpOf = (g, id) => g?.sides?.find((s) => s.id === id)?.vp ?? 0;
const beaconKey = (g) => (g?.beacons ? `${g.beacons.lit}:${g.beacons.next}` : null);

// What changed between two public states that deserves a moment, in the order
// they should play. The first state only yields the standing ones (the current
// wanted poster and the current stations), never a score or a kill.
export function momentsBetween(prev, next, side) {
  const g = next?.game;
  if (!g) return [];
  const pg = prev?.game || null;
  const out = [];
  const target = g.priorityTargets?.[side] ?? null;
  if (target != null && target !== (pg?.priorityTargets?.[side] ?? null)) out.push({ kind: "wanted", rigId: target, round: g.round });
  const bk = beaconKey(g);
  if (bk && bk !== beaconKey(pg)) out.push({ kind: "station", beacons: g.beacons, round: g.round });
  if (!pg) return out;
  for (const r of next.rigs || []) {
    const was = prev.rigs?.find((x) => x.id === r.id);
    if (r.destroyed && was && !was.destroyed) out.push({ kind: "kill", rigId: r.id, name: r.name, owner: r.owner || "a", byUs: (r.owner || "a") !== side });
  }
  for (const s of g.sides || []) {
    const d = vpOf(g, s.id) - vpOf(pg, s.id);
    if (d > 0) out.push({ kind: "vp", side: s.id, amount: d, ours: s.id === side });
  }
  return out;
}

// Pulp magazine cover copy from the real battle numbers.
// stats: { mvp: {name, dmg, kills, owner}|null, best: {actor,target,weapon,sp}|null }
export function pulpCover({ mvp = null, best = null, winner = null, side = "a", place = "the Front", round = 1, vp = [0, 0], seed = 1 } = {}) {
  const won = winner === side, draw = winner == null;
  const issue = (hashSeed(`${place}:${seed}`) % 90) + 10;
  const price = `${(hashSeed(`${seed}:${round}`) % 3) + 1}0¢`;
  const mine = side === "a" ? vp[0] : vp[1], theirs = side === "a" ? vp[1] : vp[0];
  let headline;
  if (mvp && mvp.kills >= 2) headline = `${mvp.name.toUpperCase()} SCRAPS ${mvp.kills} IRONCLADS!`;
  else if (mvp && mvp.kills === 1) headline = `${mvp.name.toUpperCase()} DRAWS FIRST BLOOD!`;
  else if (best) headline = `${best.actor.toUpperCase()}'S ${String(best.weapon).toUpperCase()} TEARS ${best.sp} SP FROM ${best.target.toUpperCase()}!`;
  else headline = draw ? "STALEMATE IN THE SMOKE!" : won ? "IRON TRIUMPHANT!" : "THE LINE BREAKS!";
  const sub = draw ? `Neither side yields at ${place}: ${mine} to ${theirs} after ${round} rounds`
    : won ? `Our Ironclads carry ${place}, ${mine} to ${theirs}, in ${round} rounds of fire`
    : `${place} is lost, ${mine} to ${theirs}, after ${round} rounds. Can the squadron rise again?`;
  const teaser = mvp ? `PLUS: the true story of ${mvp.name}, ${mvp.dmg} SP of pure fury` : "PLUS: letters from the boiler room";
  return { masthead: "IRONCLAD TALES", issue: `No. ${issue}`, price, headline, sub, teaser, tone: draw ? "draw" : won ? "win" : "loss" };
}

// Silent-film intertitles for a recorded battle: an opening card, one card
// per new round, and THE END. Returns [{ at: frameIndex, text, kind }].
export function intertitles(frames, place = "the Front") {
  const out = [{ at: 0, text: `THE BATTLE OF ${String(place).toUpperCase()}`, kind: "open" }];
  let round = frames?.[0]?.round ?? 1;
  (frames || []).forEach((f, i) => {
    if (i > 0 && f.round != null && f.round !== round) { round = f.round; out.push({ at: i, text: `ROUND ${round}`, kind: "round" }); }
  });
  out.push({ at: Math.max(0, (frames?.length || 1) - 1), text: "THE END", kind: "end" });
  return out;
}

// The whisper voice: flavour-only murmurs about what the rigs "feel". Never a
// rule; the rules stay in the wires and the glossary. Returns { key, text } for
// the first unseen line, or null. seen: Set of keys already whispered.
const partFrac = (r, l) => (r?.[l]?.max ? r[l].sp / r[l].max : 1);
export function whisperFor(state, side, seen = new Set(), tierOf = null) {
  const rigs = (state?.rigs || []).filter((r) => !r.destroyed && r.pos !== null);
  const tier = tierOf || ((r) => (Number.isFinite(r.integrity) && Number.isFinite(r.integrityMax) && r.integrityMax > 0
    ? (r.integrity <= Math.ceil(r.integrityMax / 4) ? "critical" : r.integrity * 2 <= r.integrityMax ? "bloodied" : "ok") : "ok"));
  const lines = [];
  for (const r of rigs) {
    const foe = (r.owner || "a") !== side;
    if (foe && partFrac(r, "legs") > 0 && partFrac(r, "legs") <= 1 / 3) lines.push([`legs:${r.id}`, `This one's legs are failing... ${r.name} will not outrun you for long.`]);
    if (foe && partFrac(r, "engine") > 0 && partFrac(r, "engine") <= 1 / 3) lines.push([`engine:${r.id}`, `Hear it? ${r.name}'s boiler stutters, like a tired old heart.`]);
    if (foe && tier(r) === "critical") lines.push([`crit:${r.id}`, `${r.name} is almost empty now. So much iron, so little left inside.`]);
    if (!foe && tier(r) === "critical") lines.push([`mine-crit:${r.id}`, `${r.name} is so tired. The iron remembers every blow.`]);
    if (!foe && partFrac(r, "arms") === 0) lines.push([`arms:${r.id}`, `${r.name} reaches for a gun it no longer has.`]);
  }
  const t = state?.game?.priorityTargets?.[side];
  const tr = t != null ? rigs.find((r) => r.id === t) : null;
  if (tr) lines.push([`wanted:${tr.id}:${state.game.round}`, `They want ${tr.name} dead. They always want someone dead.`]);
  const hit = lines.find(([k]) => !seen.has(k));
  return hit ? { key: hit[0], text: hit[1] } : null;
}
