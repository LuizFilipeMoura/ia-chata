import type { Rig, Component } from "../state/types";
// The client imports shared modules via the /shared static mount configured in vite.
import { partNamesOf, kindOf } from "/shared/unit-kinds.js";

export function barClass(c: Component): string {
  if (c.destroyed) return "rig-fill-dead";
  if (c.sp === 0) return "rig-fill-crit";
  const ratio = c.sp / c.max;
  if (ratio <= 0.34) return "rig-fill-low";
  if (ratio <= 0.67) return "rig-fill-warn";
  return "rig-fill-ok";
}

export function rigStatus(rig: Rig): { text: string; cls: string; gloss: string } {
  const parts = partNamesOf(kindOf(rig));
  if (rig.destroyed) return { text: "⛔ System failure — destroyed", cls: "crit", gloss: "destroyed" };
  if (parts.some((l: string) => (rig as any)[l]?.sp === 0))
    return { text: "⚠ Catastrophic damage", cls: "crit", gloss: "catastrophic-damage" };
  if (parts.some((l: string) => (rig as any)[l]?.sp / (rig as any)[l]?.max <= 0.34))
    return { text: "▲ Heavy damage — operational", cls: "warn", gloss: "heavy-damage" };
  if (parts.some((l: string) => (rig as any)[l]?.sp < (rig as any)[l]?.max))
    return { text: "◆ Damaged — operational", cls: "warn", gloss: "damaged" };
  return { text: "● All systems nominal", cls: "", gloss: "nominal" };
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
