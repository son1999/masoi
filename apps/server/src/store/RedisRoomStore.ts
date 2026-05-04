import type { ChatMessage, PublicPlayer, RoomState } from '@ma-soi/shared';
import type { RoomStore } from './RoomStore.js';

/**
 * Redis implementation skeleton.
 *
 * Filled in when scaling to multiple server instances. Same interface as
 * MemoryRoomStore — switching is a one-line change at startup.
 *
 * Likely layout:
 *   room:{id}            → JSON of RoomState (hash or string)
 *   room:byCode:{code}   → roomId
 *   room:players:{id}    → set of playerIds (for fast membership)
 *
 * Use SETEX with TTL on inactive rooms to auto-clean.
 */
export class RedisRoomStore implements RoomStore {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_redisUrl: string) {
    throw new Error('RedisRoomStore not yet implemented');
  }

  async create(_host: { id: string; nickname: string }): Promise<RoomState> {
    throw new Error('not implemented');
  }
  async getById(_roomId: string): Promise<RoomState | null> {
    throw new Error('not implemented');
  }
  async getByJoinCode(_joinCode: string): Promise<RoomState | null> {
    throw new Error('not implemented');
  }
  async addPlayer(_roomId: string, _player: PublicPlayer): Promise<RoomState | null> {
    throw new Error('not implemented');
  }
  async removePlayer(_roomId: string, _playerId: string): Promise<RoomState | null> {
    throw new Error('not implemented');
  }
  async setPlayerOnline(_roomId: string, _playerId: string, _isOnline: boolean): Promise<RoomState | null> {
    throw new Error('not implemented');
  }
  async addChatMessage(_roomId: string, _msg: ChatMessage): Promise<RoomState | null> {
    throw new Error('not implemented');
  }
  async delete(_roomId: string): Promise<void> {
    throw new Error('not implemented');
  }
}
