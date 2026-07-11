import { play, startLoop, stopLoop } from "./audioMixer";
import { soundUrl } from "./soundAssets";

interface Layers { voices: string[]; sfx: string[]; }

const FIRE_BARKS = ["fire_firing", "fire_eat_this", "fire_rounds_downrange", "fire_light_em_up"];
const MECH = ["massive_mechanical_1", "massive_mechanical_2", "massive_mechanical_3"];

// action key -> layer stems. Keys absent here play nothing (safe default).
export const ACTION_AUDIO: Record<string, Layers> = {
  fire: { voices: FIRE_BARKS, sfx: MECH },
  aimed: { voices: FIRE_BARKS, sfx: MECH },
  overclock: { voices: ["overclock_redline_it"], sfx: MECH },
  move: { voices: [], sfx: MECH },
  sprint: { voices: [], sfx: MECH },
  disengage: { voices: ["disengage_fall_back", "disengage_breaking_off", "disengage_get_out"], sfx: [] },
  purge: { voices: ["purge_venting_clear", "purge_dumping_heat"], sfx: [] },
  reload: { voices: [], sfx: ["old_panel_beep"] },
  prepare: { voices: [], sfx: ["old_panel_beep"] },
  shutdown: { voices: [], sfx: ["old_panel_beep"] },
  repair: { voices: [], sfx: ["old_panel_beep"] },
  emergencypatch: { voices: [], sfx: ["old_panel_beep"] },
};

const DAMAGE_SFX = ["tank_getting_shot_1", "tank_getting_shot_2"];
const ENGINE_LOOP = ["engine_idle"];

// Resolve stems to URLs, dropping any that are absent.
function urls(stems: string[]): string[] {
  return stems.map(soundUrl).filter((u): u is string => u !== null);
}

export function playAction(key: string): void {
  const layers = ACTION_AUDIO[key];
  if (!layers) return;
  play(urls(layers.voices), urls(layers.sfx));
}

export function playDamage(): void {
  play([], urls(DAMAGE_SFX));
}

export function startEngineLoop(): void {
  startLoop(urls(ENGINE_LOOP));
}

export function stopEngineLoop(): void {
  stopLoop();
}
