import { play, startIdle, stopIdle, SFX_GAIN } from "./audioMixer";
import { soundUrl } from "./soundAssets";

interface Layers { voices: string[]; sfx: string[]; }

// Sustained beds (running, MG rattle, furnace, engine ramp) run their full clip
// and would cut hard at the end. Give them an audible tail instead of the default
// 0.06s click-killer; impacts (cannon, tank hit, clanks, beeps) decay on their own.
const SUSTAINED_FADE_S = 0.6;
const SUSTAINED_SFX = new Set([
  "mech_running", "giant_walking_fast", "mg_50cal", "mg_machine_gun", "heat_furnace", "engine_start",
]);

// Fade for a chosen sfx list: long tail if any stem is a sustained bed.
function fadeFor(stems: string[]): number | undefined {
  return stems.some((s) => SUSTAINED_SFX.has(s)) ? SUSTAINED_FADE_S : undefined;
}

const FIRE_BARKS = ["fire_firing", "fire_eat_this", "fire_rounds_downrange", "fire_light_em_up"];
const MECH = ["massive_mechanical_1", "massive_mechanical_2", "massive_mechanical_3"];
// Cannon boom variants — pick() rotates one per shot so repeated fire doesn't
// sound identical.
const CANNON_SFX = ["cannon_fire", "cannon_fire_2", "cannon_fire_3"];
// Console beep bed — the two panel-beep clips rotated by pick() so the many
// beep-only actions (reload/prepare/shutdown/repair/patch) don't all sound alike.
const BEEP_SFX = ["old_panel_beep", "beep_warning"];
// Support module beds: console beep + a mech servo step (mech_step.mp3 — drop the
// asset in to enable; absent stems are null-filtered so a beep still plays).
const SUPPORT_SFX = [...BEEP_SFX, "mech_step"];

// action key -> layer stems. Keys absent here play nothing (safe default).
export const ACTION_AUDIO: Record<string, Layers> = {
  fire: { voices: FIRE_BARKS, sfx: CANNON_SFX }, // default; weapon-aware override below
  aimed: { voices: FIRE_BARKS, sfx: CANNON_SFX },
  overclock: { voices: ["overclock_redline_it"], sfx: MECH },
  move: { voices: [], sfx: ["mech_running"] }, // walk — steady servo gait
  sprint: { voices: [], sfx: ["giant_walking_fast"] }, // run — faster heavy stomp
  disengage: { voices: ["disengage_fall_back", "disengage_breaking_off", "disengage_get_out"], sfx: [] },
  purge: { voices: ["purge_venting_clear", "purge_dumping_heat"], sfx: [] },
  reload: { voices: [], sfx: ["gun_reload"] },
  prepare: { voices: [], sfx: BEEP_SFX },
  shutdown: { voices: [], sfx: [] },
  repair: { voices: [], sfx: BEEP_SFX },
  emergencypatch: { voices: [], sfx: BEEP_SFX },
  // Support-unit module actions (spec: Support Units) — a servo step under the
  // console beep. `pick()` rotates between the two per action.
  fieldweld: { voices: [], sfx: SUPPORT_SFX },
  vent: { voices: [], sfx: SUPPORT_SFX },
  paint: { voices: [], sfx: SUPPORT_SFX },
};

const DAMAGE_SFX = ["tank_getting_shot_1", "tank_getting_shot_2"];
const BRACE_SFX = ["brace_for_impact"];
const HEAT_SFX = ["heat_furnace"];
const HEAT_EXPLOSION_SFX = ["heat_explosion"];
const MG_SFX = ["mg_50cal", "mg_machine_gun"];
// Weapons whose fire should rattle like a machine gun rather than boom like a cannon.
const MG_WEAPONS = new Set(["Mini Gun", "Double MG"]);

// Pick the gun bed for a fire/aimed action from the weapon it was dispatched with:
// melee = mechanical clank, named MG weapon = MG rattle, everything else = cannon.
function gunSfxFor(attrs: Record<string, unknown>): string[] {
  if (attrs.weapon === "melee") return MECH;
  const name = typeof attrs.weaponName === "string" ? attrs.weaponName : "";
  return MG_WEAPONS.has(name) ? MG_SFX : CANNON_SFX;
}
const ENGINE_LOOP = ["engine_idle"];
const ENGINE_START = ["engine_start"];

// Resolve stems to URLs, dropping any that are absent.
function urls(stems: string[]): string[] {
  return stems.map(soundUrl).filter((u): u is string => u !== null);
}

export function playAction(key: string, attrs?: Record<string, unknown>): void {
  const layers = ACTION_AUDIO[key];
  if (!layers) return;
  const sfx = (key === "fire" || key === "aimed") && attrs ? gunSfxFor(attrs) : layers.sfx;
  play(urls(layers.voices), urls(sfx), SFX_GAIN, fadeFor(sfx));
}

export function playDamage(): void {
  play([], urls(DAMAGE_SFX));
}

// Ricochet crack cue when the answer-token gate opens — "brace for impact" for
// the incoming attack hidden behind the token.
export function playBraceForImpact(): void {
  play([], urls(BRACE_SFX));
}

// Loud attack-telegraph klaxon: a warning beep layered with the brace bark, for
// the defender's "incoming fire" overlay. Respects the mixer's enabled flag.
const THREAT_SFX = ["beep_warning", "brace_for_impact"];
export function playThreatAlarm(): void {
  play([], urls(THREAT_SFX));
}

export function playHeat(): void {
  play([], urls(HEAT_SFX), SFX_GAIN / 3, fadeFor(HEAT_SFX)); // furnace is loud — a third volume
}

// Cinematic blast when an overheat check rolls a damaging threshold (any heatKey
// but "safe"). Louder than the furnace crossing — this is the payoff.
export function playHeatExplosion(): void {
  play([], urls(HEAT_EXPLOSION_SFX));
}

export function playEngineStart(): void {
  play([], urls(ENGINE_START), SFX_GAIN, fadeFor(ENGINE_START));
}

export function startEngineLoop(): void {
  startIdle(urls(ENGINE_LOOP));
}

export function stopEngineLoop(): void {
  stopIdle();
}
