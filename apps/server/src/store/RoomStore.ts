import type { ChatMessage, PublicPlayer, RoomState } from '@ma-soi/shared';

/**
 * Storage abstraction for game rooms.
 *
 * MemoryRoomStore: dev / single-instance.
 * RedisRoomStore: prod / multi-instance (skeleton, not yet implemented).
 *
 * All methods are async to make the interface compatible with Redis later.
 */
export interface RoomStore {
  create(host: { id: string; nickname: string }): Promise<RoomState>;
  getById(roomId: string): Promise<RoomState | null>;
  getByJoinCode(joinCode: string): Promise<RoomState | null>;

  addPlayer(roomId: string, player: PublicPlayer): Promise<RoomState | null>;
  removePlayer(roomId: string, playerId: string): Promise<RoomState | null>;
  setPlayerOnline(roomId: string, playerId: string, isOnline: boolean): Promise<RoomState | null>;

  addChatMessage(roomId: string, msg: ChatMessage): Promise<RoomState | null>;

  delete(roomId: string): Promise<void>;
}
