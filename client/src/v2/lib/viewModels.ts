import { MAX_RIGS_PER_SIDE } from "/shared/game-state.js";
import type { Rig } from "../../state/types";

// SP-bar gradient thresholds, ported from the mockup's spColor (mockup lines
// 516-522). Returns a CSS linear-gradient string used as an inline bar fill.
export function spColor(cur: number, max: number): string {
  const p = max ? cur / max : 0;
  if (cur <= 0) return "linear-gradient(90deg,#8f2f22,#f26a50)";
  if (p <= 0.33) return "linear-gradient(90deg,#cf6a24,#ef9450)";
  if (p <= 0.66) return "linear-gradient(90deg,#c99327,#e8bd57)";
  return "linear-gradient(90deg,#4c9a5f,#6cc47f)";
}

// Cosmetic only — the game has no tonnage stat. Used for the Yard header flavor.
const TONS: Record<string, number> = { light: 6, medium: 8, heavy: 10, colossal: 12 };
export function tonnage(rigs: Rig[], side: string): number {
  return rigs
    .filter((r) => (r.owner || "a") === side)
    .reduce((sum, r) => sum + (TONS[r.weightClass] ?? 0), 0);
}

export function commissioned(rigs: Rig[], side: string): { count: number; max: number } {
  const count = rigs.filter((r) => (r.owner || "a") === side).length;
  return { count, max: MAX_RIGS_PER_SIDE };
}
