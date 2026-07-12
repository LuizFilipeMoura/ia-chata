import type { Rig, GameState, Turn } from "./src/state/types";

declare module "/shared/game-state.js" {
  export const SUPPORTED_RIG_CLASSES: string[];
  export const WEAPONS: Record<string, Record<string, {
    rof: number; str: number;
    acc?: number[]; rng?: number[];
    sweet?: number; peak?: number; dropoff?: number; minRange?: number; maxRange?: number;
    melee?: boolean; perks?: string[];
  }>>;
  export const UNIT_WEAPONS: Record<string, {
    rof: number; str: number;
    acc?: number[]; rng?: number[];
    sweet?: number; peak?: number; dropoff?: number; minRange?: number; maxRange?: number;
    melee?: boolean; perks?: string[]; flatPick?: boolean;
  }>;
  export const EQUIPMENT: Record<string, {
    family: string;
    label: string;
    passive: string;
    active: { key: string; label: string; heat: number; text: string };
  }>;
  export const WEAPON_UPGRADES: Record<string, Array<{ id: string; nature: "field" | "tuned" | "prototype"; name: string; tag: string; [k: string]: unknown }>>;
  export const EQUIPMENT_UPGRADES: Record<string, Array<{ id: string; nature: "field" | "tuned" | "prototype"; name: string; tag: string; [k: string]: unknown }>>;
  export const NATURES: ReadonlyArray<"field" | "tuned" | "prototype">;
  export function upgradeNature(weaponName: string, upgradeId?: string | null): "field" | "tuned" | "prototype" | null;
  export function equipmentUpgradeNature(equipmentId: string, upgradeId?: string | null): "field" | "tuned" | "prototype" | null;
  export function firstEquipmentUpgradeId(equipmentId: string): string | null;
  export function countPrototypes(
    weapons: { longRange?: string; melee?: string },
    upgrades: { longRange?: string | null; melee?: string | null },
    equipment?: string,
    equipmentUpgrade?: string | null,
  ): number;
  export const CHASSIS: Array<{ id: string; label: string; class: string; longRange: string; melee: string }>;
  export function chassisById(id?: string | null): { id: string; label: string; class: string; longRange: string; melee: string } | null;
  export const SUPPORT_TEMPLATES: Array<{ id: string; name: string; kind: "tank" | "walker"; unit: string | null; modules: string[] }>;
  export function templateById(id?: string | null): { id: string; name: string; kind: "tank" | "walker"; unit: string | null; modules: string[] } | null;
  export function templatesForKind(kind: string): Array<{ id: string; name: string; kind: "tank" | "walker"; unit: string | null; modules: string[] }>;
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

declare module "/shared/combat.js" {
  export function weaponAccAt(
    profile: { melee?: boolean; acc?: number[]; peak?: number; sweet?: number; dropoff?: number },
    distance: number | undefined,
  ): number;
}

declare module "/shared/battle-view.js" {
  export function availableActions(rig: Rig, turn: Turn, round?: number): Array<{
    key: string; label: string; enabled: boolean; heat: number; cost?: number; note?: string;
  }>;
  export function actionBudget(rig: Rig, turn: Turn): {
    used: number; left: number; max: number; reduced: boolean;
  };
  export function rigModifiers(rig: Rig): Array<{ key: string; tag: string; tone: string; gloss: string }>;
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
  export const MODULES: Record<string, { id: string; label: string; action: string | null }>;
  export const MODULE_IDS: string[];
  export function normalizeModules(modules: unknown): string[];
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
