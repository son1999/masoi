// === Domain types ===

export type RoomStatus = 'lobby' | 'in_game' | 'ended';

export interface PublicPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
  isOnline: boolean;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  sentAt: number;
}

export interface RoomState {
  id: string;
  joinCode: string;
  hostId: string;
  status: RoomStatus;
  players: PublicPlayer[];
  chat: ChatMessage[];
  createdAt: number;
  game?: GameStatePublic;
}

// === Game ===

export type RoleId = 'villager' | 'werewolf' | 'seer' | 'witch' | 'guard';
export type RoleTeam = 'village' | 'wolves';

export type GamePhase =
  | 'lobby'
  | 'night_guard'
  | 'night_wolves'
  | 'night_seer'
  | 'night_witch'
  | 'day_reveal'
  | 'day_main'
  | 'ended';

export interface GamePlayerPublic {
  id: string;
  nickname: string;
  alive: boolean;
  revealedRole?: RoleId;
}

export interface PublicLogEntry {
  id: string;
  ts: number;
  text: string;
  kind: 'phase' | 'death' | 'win' | 'vote' | 'system';
}

export interface GameStatePublic {
  phase: GamePhase;
  night: number;
  phaseEndsAt: number | null;
  players: GamePlayerPublic[];
  log: PublicLogEntry[];
  vote?: VoteState;
  winner?: RoleTeam;
}

export interface VoteState {
  votes: Record<string, string | null>;
}

export interface MyGameInfo {
  role: RoleId;
  team: RoleTeam;
  fellowWolves?: string[];
  witchPotions?: { heal: boolean; poison: boolean };
}

export type NightActionRequest =
  | { type: 'guard_protect'; targetId: string }
  | { type: 'wolf_kill'; targetId: string }
  | { type: 'wolf_skip' }
  | { type: 'seer_check'; targetId: string }
  | { type: 'witch_heal' }
  | { type: 'witch_poison'; targetId: string }
  | { type: 'witch_pass' };

export type NightActionResult =
  | { type: 'seer_result'; targetId: string; targetRole: RoleId }
  | { type: 'witch_view'; killedTargetId: string | null; canHeal: boolean; canPoison: boolean }
  | { type: 'guard_ack' }
  | {
      type: 'wolf_ack';
      pendingKillTargetId: string | null;
      skipVotes: number;
      totalWolves: number;
      decidedVotes: number;
    }
  | { type: 'no_op' };

// === Result envelope ===

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// === Auth ===

export interface AuthLoginPayload {
  nickname: string;
}

export interface AuthSession {
  playerId: string;
  nickname: string;
  token: string;
}

// === Room ops ===

export interface RoomJoinPayload {
  joinCode: string;
}

export interface ChatSendPayload {
  text: string;
}

// === Voice ===

export interface VoiceTokenInfo {
  url: string;
  token: string;
  identity: string;
  roomName: string;
}

// === Socket.IO event maps ===

export interface ClientToServerEvents {
  'ping:test': (data: { sentAt: number }, ack: (pong: { sentAt: number; serverTime: number }) => void) => void;

  'room:create': (ack: (res: Result<RoomState>) => void) => void;
  'room:join': (data: RoomJoinPayload, ack: (res: Result<RoomState>) => void) => void;
  'room:get': (data: { roomId: string }, ack: (res: Result<RoomState>) => void) => void;
  'room:leave': (ack: (res: Result<null>) => void) => void;

  'chat:send': (data: ChatSendPayload, ack: (res: Result<null>) => void) => void;

  'voice:token': (ack: (res: Result<VoiceTokenInfo>) => void) => void;
  'voice:test_force_mute': (data: { targetPlayerId: string }, ack: (res: Result<null>) => void) => void;

  'game:start': (ack: (res: Result<null>) => void) => void;
  'game:night_action': (data: NightActionRequest, ack: (res: Result<null>) => void) => void;
  'game:vote': (data: { targetId: string | null }, ack: (res: Result<null>) => void) => void;
}

export interface ServerToClientEvents {
  'system:announce': (msg: string) => void;
  'room:state': (room: RoomState) => void;
  'room:player_joined': (player: PublicPlayer) => void;
  'room:player_left': (playerId: string) => void;
  'room:player_online_changed': (playerId: string, isOnline: boolean) => void;
  'chat:message': (msg: ChatMessage) => void;

  'game:state': (state: GameStatePublic) => void;
  'game:my_info': (info: MyGameInfo) => void;
  'game:night_result': (result: NightActionResult) => void;
}

export interface SocketData {
  playerId: string;
  nickname: string;
  roomId?: string;
}

// === Constants ===

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;
export const CHAT_MAX_LEN = 500;
export const JOIN_CODE_LEN = 6;

export const MIN_PLAYERS_TO_START = 4;

// === Phase durations (server-authoritative) ===

export const PHASE_DURATIONS_MS: Record<Exclude<GamePhase, 'lobby' | 'ended'>, number> = {
  night_guard: 25_000,
  night_wolves: 35_000,
  night_seer: 25_000,
  night_witch: 30_000,
  day_reveal: 10_000,
  day_main: 180_000,
};

// === Role distribution ===

export interface RoleDistribution {
  werewolf: number;
  seer: number;
  witch: number;
  guard: number;
  villager: number;
}

export function computeRoleDistribution(playerCount: number): RoleDistribution {
  const werewolf = Math.max(1, Math.floor(playerCount / 4));
  const seer = playerCount >= 5 ? 1 : 0;
  const witch = playerCount >= 6 ? 1 : 0;
  const guard = playerCount >= 7 ? 1 : 0;
  const special = werewolf + seer + witch + guard;
  const villager = Math.max(0, playerCount - special);
  return { werewolf, seer, witch, guard, villager };
}

export function roleTeam(role: RoleId): RoleTeam {
  return role === 'werewolf' ? 'wolves' : 'village';
}
