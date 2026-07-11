import { useSyncExternalStore } from "react";
import { getEnabled, setEnabled, subscribe } from "./audioMixer";

/** Bind a component to the mixer's enabled flag. */
export function useBattleAudio(): { on: boolean; toggle: () => void } {
  const on = useSyncExternalStore(subscribe, getEnabled, getEnabled);
  return { on, toggle: () => setEnabled(!getEnabled()) };
}
