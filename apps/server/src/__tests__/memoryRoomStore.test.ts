import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JOIN_CODE_LEN, type ChatMessage, type PublicPlayer } from '@ma-soi/shared';
import { MemoryRoomStore } from '../store/MemoryRoomStore.js';

const player = (id: string, nickname = id): PublicPlayer => ({
  id,
  nickname,
  isHost: false,
  isOnline: true,
});

const chatMsg = (id: string, playerId: string, text = 'hi'): ChatMessage => ({
  id,
  playerId,
  nickname: playerId,
  text,
  sentAt: Date.now(),
});

describe('MemoryRoomStore', () => {
  let store: MemoryRoomStore;

  beforeEach(() => {
    store = new MemoryRoomStore();
  });

  describe('create', () => {
    it('creates a lobby room with the host as the first player', async () => {
      const room = await store.create({ id: 'p1', nickname: 'Alice' });
      expect(room.hostId).toBe('p1');
      expect(room.status).toBe('lobby');
      expect(room.players).toHaveLength(1);
      expect(room.players[0]).toMatchObject({ id: 'p1', nickname: 'Alice', isHost: true, isOnline: true });
      expect(room.chat).toEqual([]);
      expect(room.joinCode).toHaveLength(JOIN_CODE_LEN);
    });

    it('uses a safe alphabet for join codes (no I, O, 0, 1)', async () => {
      // Run a few creates and ensure none of the codes contain confusing chars
      for (let i = 0; i < 20; i++) {
        const room = await store.create({ id: `p${i}`, nickname: `n${i}` });
        expect(room.joinCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
      }
    });

    it('different rooms have different ids', async () => {
      const a = await store.create({ id: 'p1', nickname: 'A' });
      const b = await store.create({ id: 'p2', nickname: 'B' });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('lookups', () => {
    it('getById returns null for unknown room', async () => {
      expect(await store.getById('nope')).toBeNull();
    });

    it('getByJoinCode returns null for unknown code', async () => {
      expect(await store.getByJoinCode('ZZZZZZ')).toBeNull();
    });

    it('getById and getByJoinCode resolve to the same room after create', async () => {
      const room = await store.create({ id: 'p1', nickname: 'A' });
      expect(await store.getById(room.id)).toBe(room);
      expect(await store.getByJoinCode(room.joinCode)).toBe(room);
    });
  });

  describe('addPlayer', () => {
    it('appends a new player', async () => {
      const room = await store.create({ id: 'p1', nickname: 'Host' });
      const updated = await store.addPlayer(room.id, player('p2'));
      expect(updated!.players).toHaveLength(2);
      expect(updated!.players.find((p) => p.id === 'p2')).toBeDefined();
    });

    it('is idempotent for the same player id', async () => {
      const room = await store.create({ id: 'p1', nickname: 'Host' });
      await store.addPlayer(room.id, player('p2'));
      const updated = await store.addPlayer(room.id, player('p2'));
      expect(updated!.players).toHaveLength(2);
    });

    it('returns null for unknown room', async () => {
      expect(await store.addPlayer('nope', player('p2'))).toBeNull();
    });
  });

  describe('removePlayer', () => {
    it('promotes the next player to host when host leaves', async () => {
      const room = await store.create({ id: 'host', nickname: 'Host' });
      await store.addPlayer(room.id, player('p2'));
      await store.addPlayer(room.id, player('p3'));

      const updated = await store.removePlayer(room.id, 'host');
      expect(updated).not.toBeNull();
      expect(updated!.hostId).toBe('p2');
      expect(updated!.players.find((p) => p.id === 'p2')!.isHost).toBe(true);
      expect(updated!.players.find((p) => p.id === 'host')).toBeUndefined();
    });

    it('deletes the room when the last player leaves', async () => {
      const room = await store.create({ id: 'host', nickname: 'Host' });
      const result = await store.removePlayer(room.id, 'host');
      expect(result).toBeNull();
      expect(await store.getById(room.id)).toBeNull();
      expect(await store.getByJoinCode(room.joinCode)).toBeNull();
    });

    it('removing a non-host player keeps the host', async () => {
      const room = await store.create({ id: 'host', nickname: 'Host' });
      await store.addPlayer(room.id, player('p2'));
      const updated = await store.removePlayer(room.id, 'p2');
      expect(updated!.hostId).toBe('host');
      expect(updated!.players).toHaveLength(1);
    });
  });

  describe('setPlayerOnline', () => {
    it('flips the online flag', async () => {
      const room = await store.create({ id: 'host', nickname: 'Host' });
      const after = await store.setPlayerOnline(room.id, 'host', false);
      expect(after!.players[0]!.isOnline).toBe(false);
      const reset = await store.setPlayerOnline(room.id, 'host', true);
      expect(reset!.players[0]!.isOnline).toBe(true);
    });

    it('no-op for unknown player id', async () => {
      const room = await store.create({ id: 'host', nickname: 'Host' });
      const after = await store.setPlayerOnline(room.id, 'ghost', false);
      expect(after).not.toBeNull();
      expect(after!.players[0]!.isOnline).toBe(true);
    });
  });

  describe('addChatMessage', () => {
    it('appends a message', async () => {
      const room = await store.create({ id: 'host', nickname: 'Host' });
      const updated = await store.addChatMessage(room.id, chatMsg('m1', 'host', 'hello'));
      expect(updated!.chat).toHaveLength(1);
      expect(updated!.chat[0]!.text).toBe('hello');
    });

    it('caps history at 200 messages, keeping the most recent', async () => {
      const room = await store.create({ id: 'host', nickname: 'Host' });
      for (let i = 0; i < 250; i++) {
        await store.addChatMessage(room.id, chatMsg(`m${i}`, 'host', `t${i}`));
      }
      const fetched = (await store.getById(room.id))!;
      expect(fetched.chat).toHaveLength(200);
      expect(fetched.chat[0]!.id).toBe('m50');
      expect(fetched.chat[fetched.chat.length - 1]!.id).toBe('m249');
    });
  });

  describe('joinCode collision retry', () => {
    it('throws when no unique code can be generated within the retry budget', async () => {
      // Force every Math.random() to 0 → generateJoinCode always returns the same string.
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
      try {
        // First create succeeds (no collision yet).
        await store.create({ id: 'p1', nickname: 'A' });
        // Second create: same code is already taken; with deterministic Math.random,
        // every retry produces the same code → throws after the bound.
        await expect(store.create({ id: 'p2', nickname: 'B' })).rejects.toThrow(/joinCode/);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('delete', () => {
    it('removes the room and its joinCode index entry', async () => {
      const room = await store.create({ id: 'host', nickname: 'Host' });
      await store.delete(room.id);
      expect(await store.getById(room.id)).toBeNull();
      expect(await store.getByJoinCode(room.joinCode)).toBeNull();
    });

    it('is a no-op for unknown room id', async () => {
      await expect(store.delete('nope')).resolves.toBeUndefined();
    });
  });
});
