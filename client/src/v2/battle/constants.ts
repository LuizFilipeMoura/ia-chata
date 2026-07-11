// Battle-action constants copied verbatim from V1 BattleActionsContext.tsx so the
// V2 native flows carry the exact same tuning (distances, heat, hold timers).

// A glyph per action so the console reads at a glance instead of as a wall of
// text (battle.js:11-16).
export const ACTION_ICONS: Record<string, string> = {
  move: "👣", sprint: "🏃", fire: "🎯", aimed: "🔭",
  reload: "🔄", repair: "🔧", prepare: "🛡️", shutdown: "⏻", disengage: "🔓",
  harden: "🧱", purge: "❄️", jumpjets: "🚀", overclock: "⚡", emergencypatch: "🩹",
};
export const iconFor = (key: string) => ACTION_ICONS[key] || "⚙️";

export const LOC_CHOICES = [
  { value: "hull", label: "Hull", icon: "🛡️" },
  { value: "arms", label: "Arms", icon: "🦾" },
  { value: "legs", label: "Legs", icon: "🦿" },
  { value: "engine", label: "Engine", icon: "🔩" },
];

// §5 base Speed (inches) per weight class — the physical reach of a Move.
// House-rule tuning: whole-inch speeds so tabletop measuring stays clean.
// Mediums bumped up a notch (were crawling) while keeping the light > medium >
// heavy > colossal ladder.
export const SPEED: Record<string, number> = { light: 5, medium: 4, heavy: 3, colossal: 2 };
export const MOVE_HOLD_MS = 5000;
export const SPRINT_HOLD_MS = 8000;
export const holdMsFor = (key: string) => (key === "sprint" ? SPRINT_HOLD_MS : MOVE_HOLD_MS);
