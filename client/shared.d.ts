import type { Rig, GameState, Turn } from "./src/state/types";

declare module "/shared/game-state.js" {
  export const MAX_RIGS_PER_SIDE: number;
  export const MAX_RIGS_TOTAL: number;
  export const SUPPORTED_RIG_CLASSES: string[];
  export const WEAPONS: Record<string, string[]>;
  export const EQUIPMENT: Record<string, { label: string; passive: string; active?: string }>;
  export const WEAPON_UPGRADES: Record<string, Array<{ id: string; name: string; [k: string]: unknown }>>;
  export const RIG_DEFAULTS: Record<string, { hull: number; arms: number; legs: number; engine: number }>;
  export function canAddRigForSide(room: { rigs: Rig[]; game?: GameState | null }, sideId: string): boolean;
  export function heatMeter(rig: Rig): {
    heat: number; cap: number; floor: number; over: number; bonus: number;
    zone: "cold" | "cool" | "warm" | "redline" | "over";
  };
  export function defaultWeaponUpgrade(weaponName: string): string;
  export function normalizeWeaponUpgrade(weaponName: string, upgradeId?: string | null): string;
  export function upgradeForWeapon(weaponName: string, upgradeId?: string | null): { id: string; name: string } | null;
}

declare module "/shared/battle-view.js" {
  export function availableActions(rig: Rig, turn: Turn): Array<{
    key: string; label: string; enabled: boolean; heat: number; cost?: number; note?: string;
  }>;
  export function actionBudget(rig: Rig, turn: Turn): {
    used: number; left: number; max: number; reduced: boolean;
  };
  export function rigModifiers(rig: Rig): Array<{ tag: string; tone: string }>;
  export function phaseSummary(game: GameState, rigs: Rig[]): {
    label: string; round: number; turnSide?: string | null; turnName?: string;
    activeName?: string; answerTokens: Record<string, number>;
  };
  export function outcomeText(outcome: unknown, sides: unknown): string;
}

declare module "/shared/glossary.js" {
  export const GLOSSARY: Array<{ id: string; term: string; def: string; match: string[] }>;
}
