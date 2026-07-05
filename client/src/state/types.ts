export type Loc = "hull" | "arms" | "legs" | "engine";

export interface Component {
  sp: number;
  max: number;
  destroyed: boolean;
}
export interface Engine extends Component {
  heat: number;
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
  summary?: string;
  effects?: string[];
  rolls?: Array<{ sides: number; value: number; label?: string }>;
}

export type Diagonal = "tlbr" | "trbl";
export interface Objective { x: number; y: number; vp: number; }
export interface TerrainPiece { x: number; y: number; size: "sm" | "md"; }
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
  recoveryVp?: Record<string, unknown>;
  pendingBlast?: unknown;
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
