import type { Rig } from "../state/types";

export type Composition = Record<string, number>;

// Bucket: rigs by weight class ("rig:light"), cold kinds by kind ("tank"/"walker").
// Mirrors the server's compositionOf in shared/game-state.js.
export function compositionOf(rigs: Rig[], side: string): Composition {
  const sig: Composition = {};
  for (const u of rigs) {
    if ((u.owner || "a") !== side) continue;
    const kind = u.kind || "rig";
    const key = kind === "rig" ? `rig:${u.weightClass}` : kind;
    sig[key] = (sig[key] || 0) + 1;
  }
  return sig;
}

function sideCount(rigs: Rig[], side: string): number {
  return rigs.filter((r) => (r.owner || "a") === side).length;
}

const BUCKET_LABEL: Record<string, string> = {
  "rig:light": "Light Rig",
  "rig:medium": "Medium Rig",
  "rig:heavy": "Heavy Rig",
  "rig:colossal": "Colossal Rig",
  tank: "Tank",
  walker: "Walker",
};

function bucketLabel(key: string, n: number): string {
  const base = BUCKET_LABEL[key] || key;
  return n === 1 ? base : `${base}s`;
}

export interface ParityStatus {
  atParity: boolean;
  // Most salient mismatch phrased from `mySide`'s POV, or null when at parity.
  diffLabel: string | null;
}

// Compare my composition against the opponent's. Surfaces the single largest
// mismatch: a shortfall ("Short 1 Heavy Rig") is prioritised over an excess
// ("1 extra Tank") since adding is the usual fix.
export function parityStatus(rigs: Rig[], mySide: string): ParityStatus {
  const enemy = mySide === "a" ? "b" : "a";
  const mine = compositionOf(rigs, mySide);
  const theirs = compositionOf(rigs, enemy);
  const myCount = sideCount(rigs, mySide);
  const enemyCount = sideCount(rigs, enemy);

  if (enemyCount === 0) {
    return { atParity: false, diffLabel: "Waiting for opponent to commission units." };
  }

  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
  let mismatched = false;
  let short: { key: string; n: number } | null = null;
  let extra: { key: string; n: number } | null = null;
  for (const k of keys) {
    const d = (mine[k] || 0) - (theirs[k] || 0);
    if (d !== 0) mismatched = true;
    if (d < 0 && (!short || -d > short.n)) short = { key: k, n: -d };
    if (d > 0 && (!extra || d > extra.n)) extra = { key: k, n: d };
  }

  if (!mismatched && myCount >= 1) return { atParity: true, diffLabel: null };

  if (short) return { atParity: false, diffLabel: `Short ${short.n} ${bucketLabel(short.key, short.n)}` };
  if (extra) return { atParity: false, diffLabel: `${extra.n} extra ${bucketLabel(extra.key, extra.n)}` };
  return { atParity: false, diffLabel: "Match your opponent's composition." };
}
