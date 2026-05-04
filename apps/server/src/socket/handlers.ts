import { randomUUID } from 'node:crypto';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import {
  CHAT_MAX_LEN,
  type ChatMessage,
  type ClientToServerEvents,
  type Result,
  type RoomState,
  type ServerToClientEvents,
  type SocketData,
} from '@ma-soi/shared';
import type { RoomStore } from '../store/RoomStore.js';
import {
  getLivekitUrl,
  issueLivekitToken,
  muteAllTracks,
  updateParticipantGrants,
} from '../voice/livekitClient.js';
import {
  destroyGameForRoom,
  getEngine,
  sendCurrentGameSnapshotToSocket,
  startGameForRoom,
} from './gameSessions.js';
import { MIN_PLAYERS_TO_START } from '@ma-soi/shared';

type IO = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

export function registerHandlers(io: IO, store: RoomStore) {
  io.on('connection', async (socket) => {
    const { playerId, nickname } = socket.data;

    socket.on('ping:test', (data, ack) => {
      ack({ sentAt: data.sentAt, serverTime: Date.now() });
    });

    socket.on('room:create', async (ack) => {
      try {
        if (socket.data.roomId) {
          await leaveCurrentRoom(io, socket, store);
        }
        const room = await store.create({ id: playerId, nickname });
        socket.data.roomId = room.id;
        await socket.join(room.id);
        ack({ ok: true, data: room });
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('room:join', async (data, ack) => {
      try {
        const code = String(data.joinCode ?? '').trim().toUpperCase();
        if (!code) return ack({ ok: false, error: 'Thiếu mã phòng' });
        const room = await store.getByJoinCode(code);
        if (!room) return ack({ ok: false, error: 'Không tìm thấy phòng' });
        if (room.status !== 'lobby') return ack({ ok: false, error: 'Phòng đã bắt đầu chơi' });

        if (socket.data.roomId && socket.data.roomId !== room.id) {
          await leaveCurrentRoom(io, socket, store);
        }

        const existing = room.players.find((p) => p.id === playerId);
        let updated: RoomState | null = room;
        if (existing) {
          updated = await store.setPlayerOnline(room.id, playerId, true);
          if (updated) {
            io.to(room.id).emit('room:player_online_changed', playerId, true);
          }
        } else {
          updated = await store.addPlayer(room.id, {
            id: playerId,
            nickname,
            isHost: false,
            isOnline: true,
          });
          if (updated) {
            const newPlayer = updated.players.find((p) => p.id === playerId);
            if (newPlayer) {
              socket.to(room.id).emit('room:player_joined', newPlayer);
            }
          }
        }
        if (!updated) return ack({ ok: false, error: 'Phòng không tồn tại' });

        socket.data.roomId = updated.id;
        await socket.join(updated.id);
        ack({ ok: true, data: updated });
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('room:get', async (data, ack) => {
      try {
        const room = await store.getById(data.roomId);
        if (!room) return ack({ ok: false, error: 'Phòng không tồn tại' });
        const inRoom = room.players.some((p) => p.id === playerId);
        if (!inRoom) return ack({ ok: false, error: 'Bạn không ở trong phòng này' });

        if (socket.data.roomId !== room.id) {
          if (socket.data.roomId) await leaveCurrentRoom(io, socket, store);
          socket.data.roomId = room.id;
          await socket.join(room.id);
          const updated = await store.setPlayerOnline(room.id, playerId, true);
          if (updated) {
            io.to(room.id).emit('room:player_online_changed', playerId, true);
          }
        }
        ack({ ok: true, data: room });
        await sendCurrentGameSnapshotToSocket(io, room.id, playerId);
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('room:leave', async (ack) => {
      try {
        await leaveCurrentRoom(io, socket, store);
        ack({ ok: true, data: null });
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('chat:send', async (data, ack) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) return ack({ ok: false, error: 'Bạn chưa vào phòng nào' });

        const text = String(data.text ?? '').trim();
        if (!text) return ack({ ok: false, error: 'Tin nhắn rỗng' });
        if (text.length > CHAT_MAX_LEN) return ack({ ok: false, error: 'Tin nhắn quá dài' });

        const msg: ChatMessage = {
          id: randomUUID(),
          playerId,
          nickname,
          text,
          sentAt: Date.now(),
        };
        const updated = await store.addChatMessage(roomId, msg);
        if (!updated) return ack({ ok: false, error: 'Phòng không tồn tại' });

        io.to(roomId).emit('chat:message', msg);
        ack({ ok: true, data: null });
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('game:start', async (ack) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) return ack({ ok: false, error: 'Bạn chưa vào phòng' });
        const room = await store.getById(roomId);
        if (!room) return ack({ ok: false, error: 'Phòng không tồn tại' });
        if (room.hostId !== playerId) return ack({ ok: false, error: 'Chỉ chủ phòng mới bắt đầu được' });
        if (room.players.length < MIN_PLAYERS_TO_START)
          return ack({ ok: false, error: `Cần tối thiểu ${MIN_PLAYERS_TO_START} người chơi` });
        await startGameForRoom(io, store, roomId);
        ack({ ok: true, data: null });
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('game:night_action', async (data, ack) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) return ack({ ok: false, error: 'Bạn chưa vào phòng' });
        const engine = getEngine(roomId);
        if (!engine) return ack({ ok: false, error: 'Ván chưa bắt đầu' });
        const res = engine.submitNightAction(playerId, data);
        if (!res.ok) return ack(res);
        ack({ ok: true, data: null });
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('game:vote', async (data, ack) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) return ack({ ok: false, error: 'Bạn chưa vào phòng' });
        const engine = getEngine(roomId);
        if (!engine) return ack({ ok: false, error: 'Ván chưa bắt đầu' });
        const res = engine.submitVote(playerId, data.targetId);
        if (!res.ok) return ack(res);
        ack({ ok: true, data: null });
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('voice:token', async (ack) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) return ack({ ok: false, error: 'Bạn chưa vào phòng' });
        const room = await store.getById(roomId);
        if (!room) return ack({ ok: false, error: 'Phòng không tồn tại' });

        const token = await issueLivekitToken({
          roomName: roomId,
          identity: playerId,
          nickname,
          canPublish: true,
          canSubscribe: true,
        });
        ack({
          ok: true,
          data: { url: getLivekitUrl(), token, identity: playerId, roomName: roomId },
        });
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('voice:test_force_mute', async (data, ack) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) return ack({ ok: false, error: 'Bạn chưa vào phòng' });
        const room = await store.getById(roomId);
        if (!room) return ack({ ok: false, error: 'Phòng không tồn tại' });
        if (room.hostId !== playerId) return ack({ ok: false, error: 'Chỉ chủ phòng mới mute được (test)' });
        const target = room.players.find((p) => p.id === data.targetPlayerId);
        if (!target) return ack({ ok: false, error: 'Không tìm thấy người chơi' });

        await updateParticipantGrants({
          roomName: roomId,
          identity: data.targetPlayerId,
          canPublish: false,
          canSubscribe: true,
        });
        await muteAllTracks(roomId, data.targetPlayerId).catch(() => {});
        ack({ ok: true, data: null });
      } catch (err) {
        ack({ ok: false, error: errMessage(err) });
      }
    });

    socket.on('disconnect', async () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const otherSocketsInRoom = await countOtherUserSockets(io, roomId, playerId);
      if (otherSocketsInRoom > 0) return;

      const updated = await store.setPlayerOnline(roomId, playerId, false);
      if (updated) {
        io.to(roomId).emit('room:player_online_changed', playerId, false);
      }
    });
  });
}

async function leaveCurrentRoom(io: IO, socket: IOSocket, store: RoomStore) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const playerId = socket.data.playerId;

  await socket.leave(roomId);
  socket.data.roomId = undefined;

  const otherSockets = await countOtherUserSockets(io, roomId, playerId);
  if (otherSockets > 0) return;

  const updated = await store.removePlayer(roomId, playerId);
  if (updated) {
    io.to(roomId).emit('room:player_left', playerId);
    io.to(roomId).emit('room:state', updated);
  } else {
    destroyGameForRoom(roomId);
  }
}

async function countOtherUserSockets(io: IO, roomId: string, playerId: string): Promise<number> {
  const sockets = await io.in(roomId).fetchSockets();
  return sockets.filter((s) => s.data.playerId === playerId).length;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Lỗi không xác định';
}
