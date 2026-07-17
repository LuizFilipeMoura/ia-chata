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
  /** Simulated position in field inches (centre of the rig); digital rooms only. */
  pos?: { x: number; y: number } | null;
  /** Heading in degrees; digital rooms only. */
  facing?: number;
}

export interface Side {
  id: string;
  name: string;
  vp: number;
  ready: boolean;
  bot?: string | null;
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
/**
 * One resolution step. The panel walks these in order and renders each.
 *
 * A step is never omitted to signal "nothing happened" — a chain that stopped
 * early still emits the step that stopped it, with an `out` that says why.
 * An absent step and a failed step must never look the same to a player.
 */
export interface ResolutionStep {
  kind: "hit" | "wound" | "location" | "damage";
  /** The number the dice had to beat. Null on an auto-fail (shield negate, blind arc). */
  target?: number | null;
  /** Wound step only: the effective Penetration and the struck location's Toughness. */
  pen?: number | null;
  toughness?: number | null;
  /** Location step only. Null on an aimed shot — no d12 decided the part. */
  die?: number | null;
  /**
   * Every input that FIRED. A modifier resolving to 0 is omitted, EXCEPT
   * cancellers (e.g. "targeting computer (ignores cover)") which explain an
   * absence — so the render must NOT filter zeros.
   */
  terms?: ResolutionTerm[];
  dice?: Array<{ value: number; ok: boolean }>;
  /** Human-readable outcome, e.g. "2 of 3 hit". Always present. */
  out: string;
}

export interface ResolutionBreakdown {
  actor?: string;
  weapon?: string;
  /** The target unit's NAME. Never a number — the wound TN lives on the wound step. */
  target?: string;
  /** The ordered ledger, in the engine's resolution order: hit → location → wound → damage. */
  steps?: ResolutionStep[];
  /** Structure points dealt — the headline, rendered large above the ledger. */
  sp?: number;
  location?: string;
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
