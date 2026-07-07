import type { Rig, GameState, Turn } from "./src/state/types";

declare module "/shared/game-state.js" {
  export const MAX_RIGS_PER_SIDE: number;
  export const MAX_RIGS_TOTAL: number;
  export const SUPPORTED_RIG_CLASSES: string[];
  export const WEAPONS: Record<string, string[]>;
  export const UNIT_WEAPONS: Record<string, { rof: number; str: number; acc: number[]; rng: number[]; perks: string[]; flatPick?: boolean }>;
  export const EQUIPMENT: Record<string, {
    family: string;
    label: string;
    passive: string;
    active: { key: string; label: string; heat: number; text: string };
  }>;
  export const WEAPON_UPGRADES: Record<string, Array<{ id: string; name: string; tag: string; [k: string]: unknown }>>;
  export const RIG_DEFAULTS: Record<string, { hull: number; arms: number; legs: number; engine: number }>;
  export const HEAT_CAPACITY: Record<string, number>;
  export function canAddRigForSide(room: { rigs: Rig[]; game?: GameState | null }, sideId: string): boolean;
  export function heatMeter(rig: Rig): {
    heat: number; cap: number; floor: number; over: number; bonus: number;
    zone: "cold" | "cool" | "warm" | "redline" | "over";
  };
  export function randomRigWeapons(rng?: () => number): { longRange: string; melee: string; longRangeUpgrade: string; meleeUpgrade: string };
  export function randomEquipment(rng?: () => number): string;
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

declare module "/shared/unit-kinds.js" {
  export const ROLES: string[];
  export const UNIT_KINDS: Record<string, {
    id: string;
    label: string;
    parts: Array<{ name: string; role: string }>;
    hitLocation: Array<{ min: number; part: string }>;
    armour: unknown;
    hasHeat: boolean;
    hasArcs: boolean;
    actionBudget: number;
    weaponMode: string;
    reloads: boolean;
    hasEquipment: boolean;
    reactions: boolean;
    ramStr: unknown;
    destruction: string;
  }>;
  export function kindOf(unit: unknown): string;
  export function partsOf(kindId: string): Array<{ name: string; role: string }>;
  export function partNamesOf(kindId: string): string[];
  export function roleOf(kindId: string, partName: string): string | null;
  export function partsByRole(kindId: string, role: string): string[];
  export function hitPart(kindId: string, d12: number): string | undefined;
  export function impactRow(
    kindId: string,
    partName: string,
    weightClass?: string,
  ): { direct: number; severe: number; critical: number } | null | undefined;
}

declare module "/shared/field.js" {
  export interface FieldLike { width: number; height: number; diagonal: "tlbr" | "trbl"; }
  export const FIELD_MIN: { width: number; height: number };
  export const FIELD_MAX: { width: number; height: number };
  export const FIELD_DEFAULT: { width: number; height: number };
  export const OBJ_FRACTION: number;
  export function halfDiag(w: number, h: number): number;
  export function clampDimensions(w: number, h: number): { width: number; height: number };
  export function emptyCorners(field: FieldLike): Array<{ x: number; y: number }>;
  export function deploymentCorners(field: FieldLike): Array<{ x: number; y: number }>;
  export function fieldCenter(field: FieldLike): { x: number; y: number };
  export function computeObjectives(field: FieldLike): Array<{ x: number; y: number; vp: number }>;
  export function setback(field: FieldLike): number;
  export function deployRadius(field: FieldLike): number;
  export function scatterTerrain(field: FieldLike, random?: () => number): Array<{
    x: number; y: number; kind: string; shape: "rect" | "ellipse" | "poly";
    w?: number; h?: number; rx?: number; ry?: number; rot?: number;
    points?: Array<[number, number]>;
  }>;
}
