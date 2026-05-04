import type { DefaultEventsMap, RemoteSocket, Server } from 'socket.io';
import type {
  ClientToServerEvents,
  GamePhase,
  ServerToClientEvents,
  SocketData,
} from '@ma-soi/shared';
import { GameEngine } from '../engine/GameEngine.js';
import type { InternalPlayer } from '../engine/types.js';
import { applyGrants } from '../voice/VoiceRouter.js';
import type { RoomStore } from '../store/RoomStore.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;
type IORemoteSocket = RemoteSocket<ServerToClientEvents, SocketData>;

const engines = new Map<string, GameEngine>();

export function getEngine(roomId: string): GameEngine | undefined {
  return engines.get(roomId);
}

export async function startGameForRoom(io: IO, store: RoomStore, roomId: string) {
  const room = await store.getById(roomId);
  if (!room) throw new Error('Phòng không tồn tại');
  const existing = engines.get(roomId);
  if (existing && !existing.isEnded()) throw new Error('Ván đang diễn ra');
  if (existing) existing.destroy();

  const engine = new GameEngine(room.players, {
    onStateChanged: (state) => {
      io.to(roomId).emit('game:state', state);
    },
    onMyInfo: (playerId, info) => {
      void emitToPlayer(io, roomId, playerId, (s) => s.emit('game:my_info', info));
    },
    onNightResult: (playerId, result) => {
      void emitToPlayer(io, roomId, playerId, (s) => s.emit('game:night_result', result));
    },
    onPhaseChanged: (phase: GamePhase, players: InternalPlayer[]) => {
      void applyGrants(roomId, phase, players, (m) => console.warn(`[voice] ${m}`));
    },
    onEnded: () => {
      // engine kept around so clients can still see end state; eventually cleaned up
    },
  });

  engines.set(roomId, engine);
  engine.start();
}

export function destroyGameForRoom(roomId: string) {
  const engine = engines.get(roomId);
  if (engine) {
    engine.destroy();
    engines.delete(roomId);
  }
}

async function emitToPlayer(
  io: IO,
  roomId: string,
  playerId: string,
  fn: (s: IORemoteSocket) => void,
) {
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    if (s.data.playerId === playerId) fn(s);
  }
}

export async function sendCurrentGameSnapshotToSocket(
  io: IO,
  roomId: string,
  playerId: string,
) {
  const engine = engines.get(roomId);
  if (!engine) return;
  const sockets = await io.in(roomId).fetchSockets();
  const target = sockets.find((s) => s.data.playerId === playerId);
  if (!target) return;
  target.emit('game:state', engine.buildPublicState());

  const me = engine.getInternalPlayers().find((p) => p.id === playerId);
  if (me) {
    target.emit('game:my_info', {
      role: me.role,
      team: me.role === 'werewolf' ? 'wolves' : 'village',
      fellowWolves:
        me.role === 'werewolf'
          ? engine.getInternalPlayers().filter((p) => p.role === 'werewolf').map((p) => p.id)
          : undefined,
    });
  }
}
