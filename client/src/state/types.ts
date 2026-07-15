export type Loc = string;

export interface Component {
  sp: number;
  max: number;
  destroyed: boolean;
}
export interface Engine extends Component {
  heat: number;
}

export type PrepType =
  | "brace" | "evasive" | "return" | "raise-shield"
  | "riposte" | "sidestep" | "exploit";

export interface Preparation {
  type?: PrepType;
  source?: "answer" | "action";
  faceUp?: boolean;
  hidden?: boolean; // set by publicState redaction for the opponent
}

export interface PendingAnswer {
  side: string;
  remaining: number;
}

export interface PendingReaction {
  kind: "evasive" | "return";
  attackerId: number;
  targetId: number;
  defender: string;
  attack?: Record<string, unknown>;
}

export interface Rig {
  id: number;
  name: string;
  kind?: "rig" | "tank" | "walker";
  weightClass: "light" | "medium";
  speed?: number;
  owner: "a" | "b";
  parts?: Record<string, Component>;
  hull: Component;
  arms: Component;
  legs: Component;
  engine: Engine;
  weapons?: { longRange?: string; melee?: string; unit?: string };
  weaponUpgrades?: { longRange: string | null; melee: string | null };
  modules?: string[];
  equipment: string | null;
  equipmentUpgrade?: string | null;
  chassis?: string | null;
  loaded?: { longRange?: boolean; melee?: boolean; unit?: boolean };
  weaponsDestroyed?: string[];
  preparation?: Preparation | null;
  activated: boolean;
  destroyed: boolean;
  engagedWith?: number | null;
}

export interface Side {
  id: string;
  name: string;
  vp: number;
  ready: boolean;
}

export interface Turn {
  side: string;
  activeRigId: number | null;
  actionsUsed: number;
  actionsMax: number;
  longRangeShots?: number;
}

export interface ResolutionTerm {
  value: number | string;
  label: string;
  /** Operator glyph shown before this term (e.g. "+", "·"). Omitted on the first term. */
  op?: string;
  tone?: string;
}
export interface ResolutionBreakdown {
  actor?: string;
  weapon?: string;
  /** The target unit's NAME (e.g. "Reaver") — NOT the wound TN. See `woundTarget`. */
  target?: string;
  /** Input terms of the damage equation (die + STR, or hits · weapon STR). */
  terms?: ResolutionTerm[];
  /** §7.5 — attacker's effective STR into the wound roll. */
  str?: number | null;
  /** §7.5 — the struck location's Toughness. */
  toughness?: number | null;
  /**
   * §7.5 — the wound roll's target number: wound on `d10 >= woundTarget`.
   * `str`/`toughness`/`woundTarget` are all null on an earned zero (shield
   * negate, Raking front arc), where no wound roll was made.
   */
  woundTarget?: number | null;
  /** Structure points dealt. */
  sp?: number;
  location?: string;
  /**
   * DEAD since the d10 wound rewrite — the impact-total model and its
   * direct/severe/critical tiers were deleted, and nothing in `shared/` emits
   * either field any more, so both renders are unreachable. Kept only so the
   * existing RollConsole markup still type-checks; drop them (and the
   * `rx-tier`/`v2-rx-tier` CSS) when Plan 2 reworks this breakdown into a
   * per-step ledger.
   */
  total?: number;
  /** @deprecated Dead — see `total`. */
  tier?: string;
}

export interface Resolution {
  id: number;
  kind?: string;
  rigId?: number;
  prep?: string;
  /** On an `overheat` entry: the heat-threshold row key. "safe" = no damage. */
  heatKey?: string;
  summary?: string;
  breakdown?: ResolutionBreakdown;
  effects?: string[];
  rolls?: Array<{ sides: number; value: number; label?: string; tone?: string }>;
  /** Priority Elimination award attached to a `destruction` entry. */
  vp?: { side: string; amount: number };
  /** Name of the wrecked unit, captured before it may be removed. */
  victimName?: string;
}

export type Diagonal = "tlbr" | "trbl";
export interface Objective { x: number; y: number; vp: number; }
export type TerrainKind =
  | "wood" | "building" | "crater" | "ruin" | "barricade" | "rock" | "crate";
export interface TerrainPiece {
  x: number;
  y: number;
  kind?: TerrainKind;
  shape?: "rect" | "ellipse" | "poly";
  /** rect: footprint in inches */
  w?: number;
  h?: number;
  /** ellipse: radii in inches */
  rx?: number;
  ry?: number;
  /** rotation in degrees (rect + ellipse) */
  rot?: number;
  /** poly: vertices in inches, relative to (x, y) */
  points?: Array<[number, number]>;
  /** @deprecated legacy square size, still rendered as a fallback */
  size?: "sm" | "md";
}
export interface FieldState {
  width: number;
  height: number;
  diagonal: Diagonal;
  terrain: TerrainPiece[];
  locked: boolean;
}

export interface GameState {
  round: number;
  phase: string;
  started: boolean;
  autoResolve?: boolean;
  sides: Side[];
  objectives?: Objective[];
  turn?: Turn | null;
  priorityTargets?: Record<string, number>;
  outcome?: unknown;
  resolutions?: Resolution[];
  recoveryClaims?: Record<string, number[]>;
  recoveryConflict?: number[] | null;
  pendingBlast?: unknown;
  answerTokens?: Record<string, number>;
  pendingAnswer?: PendingAnswer | null;
  pendingReaction?: PendingReaction | null;
  pendingThreat?: {
    attackerId: number;
    targetId: number;
    defender: string;
    mode: string;
    weapon: string;
  } | null;
  /** True for the acting side when a turn-scoped action can be reverted. */
  canUndo?: boolean;
}

export interface Session {
  room: string;
  side: string;
  name: string;
}

/** The `state` field of a `{ version, state }` server payload (publicState). */
export interface ServerState {
  code?: string;
  version: number;
  seeded?: boolean;
  rigs: Rig[];
  game: GameState | null;
  ownerSide?: string | null;
  field?: FieldState | null;
}
