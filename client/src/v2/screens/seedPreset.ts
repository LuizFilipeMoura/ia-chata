// The three Seed Test Battle presets (spec: 2026-07-14-seed-preset-rosters).
// Shared by the Join picker, V2App dispatch, and useSeedBattle.
export type SeedPreset = "support" | "rigs4" | "random4";

export const SEED_PRESETS: { id: SeedPreset; label: string }[] = [
  { id: "support", label: "Full spread" },
  { id: "rigs4", label: "4v4 rigs" },
  { id: "random4", label: "4v4 random" },
];
