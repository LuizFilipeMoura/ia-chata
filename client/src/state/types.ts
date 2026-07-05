export type Loc = "hull" | "arms" | "legs" | "engine";

export interface Component {
  sp: number;
  max: number;
  destroyed: boolean;
}
export interface Engine extends Component {
  heat: number;
}

export type PrepType = "brace" | "evasive" | "return" | "raise-shield";

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
  weightClass: "light" | "medium";
  owner: "a" | "b";
  hull: Component;
  arms: Component;
  legs: Component;
  engine: Engine;
  weapons?: { longRange: string; melee: string };
  weaponUpgrades?: { longRange: string; melee: string };
  equipment: string | null;
  loaded?: { longRange: boolean; melee: boolean };
  preparation?: Preparation | null;
  activated: boolean;
  destroyed: boolean;
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
}

export interface Resolution {
  id: number;
  kind?: string;
  rigId?: number;
  prep?: string;
  summary?: string;
  effects?: string[];
  rolls?: Array<{ sides: number; value: number; label?: string; tone?: string }>;
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
  bounties?: Record<string, number>;
  outcome?: unknown;
  resolutions?: Resolution[];
  recoveryClaims?: Record<string, number[]>;
  recoveryConflict?: number[] | null;
  pendingBlast?: unknown;
  answerTokens?: Record<string, number>;
  pendingAnswer?: PendingAnswer | null;
  pendingReaction?: PendingReaction | null;
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
  rigs: Rig[];
  game: GameState | null;
  ownerSide?: string | null;
  field?: FieldState | null;
}
