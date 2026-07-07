import { randomAddAttrs } from "../../lib/loadout";

export interface SeedCommand {
  side: string;
  verb: string;
  attrs: Record<string, unknown>;
}

/** Ordered commands that build a ready-to-fight match: 3 random full rigs per
 *  side, field locked by side a (first joiner = ownerSide), both sides ready. */
export function buildSeedCommands(): SeedCommand[] {
  const cmds: SeedCommand[] = [];
  for (const side of ["a", "b"] as const) {
    for (let i = 1; i <= 3; i++) {
      cmds.push({ side, verb: "add", attrs: { name: `${side.toUpperCase()}-${i}`, owner: side, ...randomAddAttrs() } });
    }
  }
  cmds.push({ side: "a", verb: "field", attrs: { action: "lock" } });
  cmds.push({ side: "a", verb: "ready", attrs: { side: "a" } });
  cmds.push({ side: "b", verb: "ready", attrs: { side: "b" } });
  return cmds;
}
