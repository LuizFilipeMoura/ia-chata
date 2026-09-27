// What each objective marker should look like: its cycling state (lit / next /
// dark, or "classic" in rooms without cycling beacons) and who holds it. Pure,
// so the scene and the tests read the same answer.
import { controlsObjective } from "../../../shared/geometry.js";
import { isPlanted } from "../../../shared/game-state.js";

const within = (r, m) => !r.destroyed && r.pos && controlsObjective({ pos: r.pos, radius: r.radius ?? 1 }, m);

export function beaconStates(objectives = [], beacons = null, rigs = []) {
  return objectives.map((m, i) => {
    const near = new Set(rigs.filter((r) => within(r, m)).map((r) => r.owner || "a"));
    if (!beacons) return { state: "classic", holder: near.size === 2 ? "contested" : near.size ? [...near][0] : null };
    const state = beacons.lit === i ? "lit" : beacons.next === i ? "next" : "dark";
    const planted = new Set(rigs.filter((r) => isPlanted(r, i) && within(r, m)).map((r) => r.owner || "a"));
    const holder = near.size === 2 ? "contested" : planted.size ? [...planted][0] : null;
    return { state, holder };
  });
}
