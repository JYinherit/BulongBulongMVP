export enum Faction { THUMB = 'THUMB', BUS = 'BUS', MYSTERY = 'MYSTERY', FINGER = 'FINGER' }
export enum CardProperty { TOP_SECRET = 'TOP_SECRET', PRECIOUS = 'PRECIOUS', DANGER = 'DANGER' }
export enum Zone { DECK = 'DECK', DISCARD = 'DISCARD', HAND = 'HAND', FIELD_TOKEN = 'FIELD_TOKEN', ACTION_STACK = 'ACTION_STACK' }
export enum PassMethod { SECRET = 'SECRET', REPORT = 'REPORT', DELIVER = 'DELIVER' }
export enum PlayerState { ALIVE = 'ALIVE', DYING = 'DYING', DEAD = 'DEAD', WIN = 'WIN' }
export enum TurnPhase { PREP = 'PREP', DRAW = 'DRAW', ACTION = 'ACTION', PASS = 'PASS', CLEANUP = 'CLEANUP', END = 'END' }
export enum GameMode { GM = 'GM', RANDOM = 'RANDOM' }

export interface Card {
  id: string;
  templateId: string;
  name: string;
  properties: CardProperty[];
  currentZone: Zone;
  ownerId: string | null;
  imageUrl?: string | null;
}

export interface Player {
  id: string;
  name: string;
  faction: Faction;
  hand: Card[];
  field: Card[];
  state: PlayerState;
  hasPassed: boolean;
  isBot?: boolean;
}

export interface PassState {
  active: boolean;
  initiatorId: string;
  card: Card;
  method: PassMethod;
  queue: string[];
  currentTargetId: string | null;
}

export interface Action {
  id: string;
  sourceId: string;
  type: string;
  targetId?: string;
  negated?: boolean;
}

export interface GameState {
  players: Player[];
  deck: Card[];
  discard: Card[];
  currentPlayerIndex: number;
  currentPhase: TurnPhase;
  passState: PassState | null;
  discardState?: {
    active: boolean;
    playerId: string;
    requiredCount: number;
  } | null;
  actionStack: Action[];
  dyingState: {
    active: boolean;
    playerId: string;
  } | null;
  logs: string[];
  winner: Faction | null;
  mode: GameMode;
}
