import type { Rig, Component, Loc } from "../state/types";

const LOCS: Loc[] = ["hull", "arms", "legs", "engine"];

export function barClass(c: Component): string {
  if (c.destroyed) return "rig-fill-dead";
  if (c.sp === 0) return "rig-fill-crit";
  const ratio = c.sp / c.max;
  if (ratio <= 0.34) return "rig-fill-low";
  if (ratio <= 0.67) return "rig-fill-warn";
  return "rig-fill-ok";
}

export function rigStatus(rig: Rig): { text: string; cls: string } {
  if (rig.destroyed) return { text: "⛔ System failure — destroyed", cls: "crit" };
  if (LOCS.some((l) => rig[l].sp === 0)) return { text: "⚠ Catastrophic damage", cls: "crit" };
  if (LOCS.some((l) => rig[l].sp / rig[l].max <= 0.34)) return { text: "▲ Heavy damage — operational", cls: "warn" };
  if (LOCS.some((l) => rig[l].sp < rig[l].max)) return { text: "◆ Damaged — operational", cls: "warn" };
  return { text: "● All systems nominal", cls: "" };
}

export function ownerLabel(owner: string | undefined, mySide: string): string {
  return (owner || "a") === mySide ? "Your Squadron" : "Enemy";
}

export function orderedRigs(rigs: Rig[], mySide: string): Rig[] {
  const enemy = mySide === "a" ? "b" : "a";
  return [
    ...rigs.filter((r) => (r.owner || "a") === mySide),
    ...rigs.filter((r) => (r.owner || "a") === enemy),
  ];
}
