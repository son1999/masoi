import { vi } from 'vitest';
import type {
  GamePhase,
  GameStatePublic,
  MyGameInfo,
  NightActionResult,
  PublicPlayer,
  RoleId,
  RoleTeam,
} from '@ma-soi/shared';
import { GameEngine, type GameEngineCallbacks } from '../../engine/GameEngine.js';
import type { InternalPlayer } from '../../engine/types.js';

export interface RoleSpec {
  id: string;
  nickname?: string;
  role: RoleId;
  alive?: boolean;
}

export interface TestEngineHandle {
  engine: GameEngine;
  cb: {
    onStateChanged: ReturnType<typeof vi.fn<(state: GameStatePublic) => void>>;
    onMyInfo: ReturnType<typeof vi.fn<(playerId: string, info: MyGameInfo) => void>>;
    onNightResult: ReturnType<typeof vi.fn<(playerId: string, result: NightActionResult) => void>>;
    onPhaseChanged: ReturnType<typeof vi.fn<(phase: GamePhase, players: InternalPlayer[]) => void>>;
    onEnded: ReturnType<typeof vi.fn<(winner: RoleTeam) => void>>;
  };
  /** Get the latest GameStatePublic emitted via onStateChanged. */
  latestState: () => GameStatePublic | null;
  /** Get the most recent NightActionResult sent to a specific player. */
  lastNightResultFor: (playerId: string) => NightActionResult | null;
  /** Force-trigger the current phase's timeout (skips real setTimeout). */
  fireTimeout: () => void;
  /** Read internal players for assertions. */
  internal: () => InternalPlayer[];
  /** Read current phase. */
  phase: () => GamePhase;
}

/**
 * Build a GameEngine with deterministic role assignment by overriding the
 * private `players` field after construction. This bypasses the random
 * Fisher-Yates shuffle in `assignRoles` so tests are reproducible.
 */
export function buildEngine(specs: RoleSpec[]): TestEngineHandle {
  const roomPlayers: PublicPlayer[] = specs.map((s) => ({
    id: s.id,
    nickname: s.nickname ?? s.id,
    isHost: false,
    isOnline: true,
  }));

  const cb = {
    onStateChanged: vi.fn<(state: GameStatePublic) => void>(),
    onMyInfo: vi.fn<(playerId: string, info: MyGameInfo) => void>(),
    onNightResult: vi.fn<(playerId: string, result: NightActionResult) => void>(),
    onPhaseChanged: vi.fn<(phase: GamePhase, players: InternalPlayer[]) => void>(),
    onEnded: vi.fn<(winner: RoleTeam) => void>(),
  } satisfies GameEngineCallbacks;

  const engine = new GameEngine(roomPlayers, cb);

  const internalPlayers: InternalPlayer[] = specs.map((s) => ({
    id: s.id,
    nickname: s.nickname ?? s.id,
    role: s.role,
    alive: s.alive ?? true,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).players = internalPlayers;

  return {
    engine,
    cb,
    latestState: () => {
      const calls = cb.onStateChanged.mock.calls;
      return calls.length === 0 ? null : (calls[calls.length - 1]![0] as GameStatePublic);
    },
    lastNightResultFor: (playerId: string) => {
      const calls = cb.onNightResult.mock.calls;
      for (let i = calls.length - 1; i >= 0; i--) {
        if (calls[i]![0] === playerId) return calls[i]![1] as NightActionResult;
      }
      return null;
    },
    fireTimeout: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = engine as any;
      if (e.phaseTimer) {
        clearTimeout(e.phaseTimer);
        e.phaseTimer = null;
      }
      e.onPhaseTimeout();
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    internal: () => (engine as any).players as InternalPlayer[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    phase: () => (engine as any).phase as GamePhase,
  };
}
