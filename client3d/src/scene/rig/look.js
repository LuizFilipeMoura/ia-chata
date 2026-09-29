// State-to-look mappings for the rig models and their combat VFX. Pure (no
// meshes, no DOM) so the tests can hold the relations: more damage, more grime;
// a sprint smokes harder than a walk; a rig's picks never change between loads.
import { rngFrom } from "./kit.js";
import { SIDE } from "../../ui/palette.js";

// ---- Sides: whale-oil amber vs oxblood (rings, stencils, insignia) ----
export const SIDE_HEX = { a: SIDE.a.hex, b: SIDE.b.hex };
// Text / stencil ink: oxblood lifted a touch so it still reads on dark paint.
export const SIDE_CSS = { a: "#d9a441", b: "#b8392f" };

// ---- Lamp eyes: amber idle, red fighting, green faulted, dim dead ----
// Warm and low: the colour * intensity stays well under the bloom threshold.
export const LAMP = {
  amber: { color: 0xffc26a, emissive: 0xd07a1c, intensity: 0.85 },
  red: { color: 0xff5a3a, emissive: 0xc8260e, intensity: 0.95 },
  green: { color: 0x9ade6a, emissive: 0x4a9a22, intensity: 0.75 },
  dead: { color: 0x2a2420, emissive: 0x000000, intensity: 0 },
};
// A fault (stalled, jammed, shut down) outranks a standing fight; the flash of
// the rig actually swinging or firing outranks both.
export function lampState({ destroyed = false, attacking = false, engaged = false, active = false, stalled = false, jammed = false, shutdown = false } = {}) {
  if (destroyed) return "dead";
  if (attacking) return "red";
  if (stalled || jammed || shutdown) return "green";
  if (engaged || active) return "red";
  return "amber";
}

// ---- Grime: how dirty a hit location gets as its SP drops ----
// Walker / drone / tank locations fold onto the four the models know.
export const LOC_ALIAS = { mount: "arms", turret: "arms", tracks: "legs" };
export const GRIME_LOCS = ["hull", "arms", "legs", "engine"];
export const GRIME_BITS = 4; // most overlay bits one location ever grows

// sp: { loc: [sp, max] } → { hull, arms, legs, engine } each 0 (pristine) .. 1 (gone).
export function grimeLevels(sp = {}) {
  const out = { hull: 0, arms: 0, legs: 0, engine: 0 };
  for (const [loc, v] of Object.entries(sp || {})) {
    const key = LOC_ALIAS[loc] || loc;
    if (!(key in out) || !Array.isArray(v)) continue;
    const [cur, max] = v;
    out[key] = Math.max(out[key], max > 0 ? Math.min(1, Math.max(0, 1 - cur / max)) : 0);
  }
  return out;
}
// One location's grime: how far its paint goes toward soot and how many
// overlay bits (soot, oil streaks, rust, bare rivets) it shows.
export function grimeLook(level) {
  const l = Math.min(1, Math.max(0, level || 0));
  return { darken: l * 0.5, bits: Math.max(0, Math.ceil(l * GRIME_BITS - 1e-9)) };
}

// ---- Clutter: the McQue kit lashed on by the crew ----
export const CLUTTER = ["crate", "jerryCan", "laundry", "antenna", "tarp", "lantern"];
const TIDY = ["antenna", "lantern"];
// How many bits a skin carries: a factory-fresh rig carries none, an ace one
// tidy piece, a lived-in rig one to three. Seeded by rig id, never repeats a piece.
export function clutterPick(seed, skin) {
  if (skin === "factory") return [];
  const r = rngFrom(`${seed}|clutter`);
  if (skin === "ace") return [TIDY[Math.floor(r() * TIDY.length)]];
  const n = 1 + Math.floor(r() * 3);
  const pool = [...CLUTTER], out = [];
  while (out.length < n) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

// ---- Nose art (the Ace skin) ----
export const NOSE_ART = ["shark", "skull", "card", "rabbit", "bolt", "scroll"];
export function noseArtFor(seed) {
  const r = rngFrom(`${seed}|noseart`);
  return NOSE_ART[Math.floor(r() * NOSE_ART.length)];
}
const NICKS = ["LUCKY {N}", "OL' {N}", "{N} BELLE", "IRON {N}", "{N} QUEEN", "BIG {N}", "{N} JACK", "MAD {N}"];
export function nicknameFor(name = "", seed = "") {
  const r = rngFrom(`${seed}|nick`);
  return NICKS[Math.floor(r() * NICKS.length)].replace("{N}", String(name || "RIG").toUpperCase());
}

// ---- Stencilled unit number: two digits, stable per rig ----
export function unitNumber(id = "") {
  const digits = String(id).match(/\d+/g);
  if (digits) return String(Number(digits.join("")) % 100).padStart(2, "0");
  const r = rngFrom(`${id}|number`);
  return String(1 + Math.floor(r() * 98)).padStart(2, "0");
}

// ---- Exhaust: diesel smoke off the stacks ----
// rate: puffs per second per rig (0 = none). Heat only smokes near capacity;
// a sprint belches; a crippled rig trails heavy black.
export function exhaustFor({ heatFrac = 0, sprinting = false, crippled = false, destroyed = false } = {}) {
  if (destroyed) return { rate: 0, size: 0, opacity: 0, dark: 0 };
  let rate = 0, size = 0.3, opacity = 0.3, dark = 0.4;
  const hot = Math.max(0, Math.min(1.6, heatFrac) - 0.7) / 0.9; // 0 at 70% heat, ~1 over capacity
  if (hot > 0) { rate += 1.5 + hot * 5; opacity += hot * 0.15; dark += hot * 0.2; }
  if (sprinting) { rate += 10; size += 0.15; opacity += 0.15; dark += 0.3; }
  if (crippled) { rate += 4; size += 0.25; opacity += 0.2; dark += 0.4; }
  return { rate, size, opacity: Math.min(0.8, opacity), dark: Math.min(1, dark) };
}

// Did this move come from a Sprint? The command says so when we have it;
// otherwise a step past plain Speed, or a +2 heat move, gives it away.
export function isSprint({ cmd = null, dist = 0, speed = 6, heatDelta = 0, attacked = false } = {}) {
  const a = cmd?.attrs?.action;
  if (a === "sprint") return true;
  if (a === "move") return false;
  return dist > speed + 0.05 || (heatDelta >= 2 && !attacked);
}

// ---- Comic onomatopoeia on hits ----
export const COMIC_WORDS = ["KRANG", "BOOM", "CLANG", "WHUMP", "SKREE"];
// Edges and sparks screech; hammers, balls, shields and fire land with a whump.
const BLADES = /saw|sword|blade|bayonet|claw|talon|lance|shock/i;
// kind: projectile kind (bullet, cannon, missile, lob, rail, arc, …).
// Returns { word, scale } (scale grows with damage).
export function comicWord({ kind = "bullet", melee = false, weapon = "", sp = 0, deflected = false } = {}) {
  const scale = 0.8 + Math.min(1, sp / 8) * 0.8;
  if (deflected) return { word: "CLANG", scale: 0.75 };
  if (melee) return { word: BLADES.test(weapon) ? "SKREE" : "WHUMP", scale };
  if (kind === "missile" || kind === "lob" || (kind === "cannon" && sp >= 5)) return { word: "BOOM", scale };
  if (kind === "arc" || kind === "rail" || kind === "steam") return { word: "SKREE", scale };
  return { word: "KRANG", scale };
}
