import { randomUUID } from 'node:crypto';
import { JOIN_CODE_LEN, type ChatMessage, type PublicPlayer, type RoomState } from '@ma-soi/shared';
import type { RoomStore } from './RoomStore.js';

const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LEN; i++) {
    code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, RoomState>();
  private codeIndex = new Map<string, string>();

  async create(host: { id: string; nickname: string }): Promise<RoomState> {
    let joinCode = generateJoinCode();
    while (this.codeIndex.has(joinCode)) joinCode = generateJoinCode();

    const id = randomUUID();
    const now = Date.now();
    const room: RoomState = {
      id,
      joinCode,
      hostId: host.id,
      status: 'lobby',
      players: [
        { id: host.id, nickname: host.nickname, isHost: true, isOnline: true },
      ],
      chat: [],
      createdAt: now,
    };

    this.rooms.set(id, room);
    this.codeIndex.set(joinCode, id);
    return room;
  }

  async getById(roomId: string): Promise<RoomState | null> {
    return this.rooms.get(roomId) ?? null;
  }

  async getByJoinCode(joinCode: string): Promise<RoomState | null> {
    const id = this.codeIndex.get(joinCode);
    if (!id) return null;
    return this.rooms.get(id) ?? null;
  }

  async addPlayer(roomId: string, player: PublicPlayer): Promise<RoomState | null> {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (!room.players.some((p) => p.id === player.id)) {
      room.players.push(player);
    }
    return room;
  }

  async removePlayer(roomId: string, playerId: string): Promise<RoomState | null> {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.players = room.players.filter((p) => p.id !== playerId);

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      this.codeIndex.delete(room.joinCode);
      return null;
    }

    if (room.hostId === playerId) {
      const newHost = room.players[0];
      if (newHost) {
        room.hostId = newHost.id;
        newHost.isHost = true;
      }
    }
    return room;
  }

  async setPlayerOnline(roomId: string, playerId: string, isOnline: boolean): Promise<RoomState | null> {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (player) player.isOnline = isOnline;
    return room;
  }

  async addChatMessage(roomId: string, msg: ChatMessage): Promise<RoomState | null> {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.chat.push(msg);
    if (room.chat.length > 200) room.chat = room.chat.slice(-200);
    return room;
  }

  async delete(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.codeIndex.delete(room.joinCode);
    this.rooms.delete(roomId);
  }
}
