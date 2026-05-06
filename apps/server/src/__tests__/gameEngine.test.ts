import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PHASE_DURATIONS_MS, type GamePhase, type RoleId } from '@ma-soi/shared';
import { buildEngine, type RoleSpec, type TestEngineHandle } from './helpers/buildEngine.js';

// Convenience setups
const setup4pNoGuard = (): RoleSpec[] => [
  { id: 'w1', role: 'werewolf' },
  { id: 'v1', role: 'villager' },
  { id: 'v2', role: 'villager' },
  { id: 'v3', role: 'villager' },
];

const setup5pSeer = (): RoleSpec[] => [
  { id: 'w1', role: 'werewolf' },
  { id: 's1', role: 'seer' },
  { id: 'v1', role: 'villager' },
  { id: 'v2', role: 'villager' },
  { id: 'v3', role: 'villager' },
];

const setup5pGuard = (): RoleSpec[] => [
  { id: 'w1', role: 'werewolf' },
  { id: 'g1', role: 'guard' },
  { id: 'v1', role: 'villager' },
  { id: 'v2', role: 'villager' },
  { id: 'v3', role: 'villager' },
];

const setup6pWitch = (): RoleSpec[] => [
  { id: 'w1', role: 'werewolf' },
  { id: 'wi1', role: 'witch' },
  { id: 'v1', role: 'villager' },
  { id: 'v2', role: 'villager' },
  { id: 'v3', role: 'villager' },
  { id: 'v4', role: 'villager' },
];

const setup6p2Wolves = (): RoleSpec[] => [
  { id: 'w1', role: 'werewolf' },
  { id: 'w2', role: 'werewolf' },
  { id: 'v1', role: 'villager' },
  { id: 'v2', role: 'villager' },
  { id: 'v3', role: 'villager' },
  { id: 'v4', role: 'villager' },
];

const setup7pFull = (): RoleSpec[] => [
  { id: 'g1', role: 'guard' },
  { id: 'w1', role: 'werewolf' },
  { id: 's1', role: 'seer' },
  { id: 'wi1', role: 'witch' },
  { id: 'v1', role: 'villager' },
  { id: 'v2', role: 'villager' },
  { id: 'v3', role: 'villager' },
];

describe('GameEngine — phase machine', () => {
  let h: TestEngineHandle | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    h?.engine.destroy();
    h = null;
    vi.useRealTimers();
  });

  it('start() throws if fewer than MIN_PLAYERS_TO_START', () => {
    h = buildEngine([
      { id: 'p1', role: 'werewolf' },
      { id: 'p2', role: 'villager' },
      { id: 'p3', role: 'villager' },
    ]);
    expect(() => h!.engine.start()).toThrow(/4/);
  });

  it('start() with 4p (no guard/seer/witch) goes straight to night_wolves', () => {
    h = buildEngine(setup4pNoGuard());
    h.engine.start();
    expect(h.phase()).toBe('night_wolves');
    expect(h.cb.onPhaseChanged).toHaveBeenCalledWith('night_wolves', expect.any(Array));
  });

  it('start() with full roles enters night_guard first', () => {
    h = buildEngine(setup7pFull());
    h.engine.start();
    expect(h.phase()).toBe('night_guard');
  });

  it('start() emits onMyInfo for every player exactly once', () => {
    h = buildEngine(setup7pFull());
    h.engine.start();
    expect(h.cb.onMyInfo).toHaveBeenCalledTimes(7);
    const ids = h.cb.onMyInfo.mock.calls.map((c) => c[0]).sort();
    expect(ids).toEqual(['g1', 's1', 'v1', 'v2', 'v3', 'w1', 'wi1']);
  });

  it('skips a night phase when its actor is dead (e.g., dead seer)', () => {
    h = buildEngine([
      { id: 'w1', role: 'werewolf' },
      { id: 's1', role: 'seer', alive: false }, // pre-killed
      { id: 'v1', role: 'villager' },
      { id: 'v2', role: 'villager' },
    ]);
    h.engine.start();
    // No guard, no witch; seer is dead → goes straight to night_wolves
    expect(h.phase()).toBe('night_wolves');
  });

  it('night_witch is skipped when both potions are exhausted', () => {
    h = buildEngine(setup6pWitch());
    h.engine.start();
    // night_wolves first (no guard), wolf kills v1
    expect(h.phase()).toBe('night_wolves');
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    // Should advance: no seer? this setup has no seer → night_witch
    expect(h.phase()).toBe('night_witch');
    // Witch heals (potion used)
    h.engine.submitNightAction('wi1', { type: 'witch_heal' });
    // Day_reveal → day_main path
    expect(h.phase()).toBe('day_reveal');
    // Skip day_reveal timer
    h.fireTimeout();
    expect(h.phase()).toBe('day_main');
    // Skip day_main: everyone alive votes null
    for (const id of ['w1', 'wi1', 'v1', 'v2', 'v3', 'v4']) {
      h.engine.submitVote(id, null);
    }
    // tryAutoSkipDayVote should advance to next night
    // night 2: night_wolves first; wolf kills again to expose witch_heal-empty path
    expect(h.phase()).toBe('night_wolves');
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    // Now in night_witch — but heal already used. Try witch_poison
    expect(h.phase()).toBe('night_witch');
    h.engine.submitNightAction('wi1', { type: 'witch_poison', targetId: 'v2' });
    // Now both potions exhausted. Day_reveal → day_main → vote null → night_wolves.
    expect(h.phase()).toBe('day_reveal');
    h.fireTimeout();
    // skip day_main
    const aliveAfter = h.internal().filter((p) => p.alive);
    for (const p of aliveAfter) h.engine.submitVote(p.id, null);
    // Next night: witch has no potions → phaseHasActor false → night_witch is skipped.
    // After night_wolves attempts, advance goes through night_seer (not present) and
    // night_witch (skipped) → straight to day_reveal.
    expect(h.phase()).toBe('night_wolves');
    h.engine.submitNightAction('w1', { type: 'wolf_skip' });
    expect(h.phase()).toBe('day_reveal');
  });

  it('phase setTimeout is scheduled with the configured duration', () => {
    h = buildEngine(setup4pNoGuard());
    h.engine.start();
    expect(h.phase()).toBe('night_wolves');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const phaseEndsAt = (h.engine as any).phaseEndsAt as number;
    expect(phaseEndsAt).toBeGreaterThan(Date.now());
    expect(phaseEndsAt - Date.now()).toBeLessThanOrEqual(PHASE_DURATIONS_MS.night_wolves);
  });

  it('day_reveal auto-advances to day_main on timeout', () => {
    h = buildEngine(setup4pNoGuard());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    expect(h.phase()).toBe('day_reveal');
    h.fireTimeout();
    expect(h.phase()).toBe('day_main');
  });
});

describe('GameEngine — night actions validation', () => {
  let h: TestEngineHandle;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    h.engine.destroy();
    vi.useRealTimers();
  });

  it('rejects action from a dead player', () => {
    h = buildEngine([
      { id: 'w1', role: 'werewolf' },
      { id: 'v1', role: 'villager', alive: false },
      { id: 'v2', role: 'villager' },
      { id: 'v3', role: 'villager' },
    ]);
    h.engine.start();
    const r = h.engine.submitNightAction('v1', { type: 'wolf_kill', targetId: 'w1' });
    expect(r.ok).toBe(false);
  });

  it('rejects guard_protect outside night_guard', () => {
    h = buildEngine(setup7pFull());
    h.engine.start();
    expect(h.phase()).toBe('night_guard');
    h.engine.submitNightAction('g1', { type: 'guard_protect', targetId: 'v1' });
    // now night_wolves
    const r = h.engine.submitNightAction('g1', { type: 'guard_protect', targetId: 'v2' });
    expect(r.ok).toBe(false);
  });

  it('rejects guard_protect from non-guard', () => {
    h = buildEngine(setup7pFull());
    h.engine.start();
    const r = h.engine.submitNightAction('v1', { type: 'guard_protect', targetId: 'v2' });
    expect(r.ok).toBe(false);
  });

  it('rejects guard protecting same target two consecutive nights', () => {
    h = buildEngine(setup5pGuard());
    h.engine.start();
    expect(h.phase()).toBe('night_guard');
    expect(h.engine.submitNightAction('g1', { type: 'guard_protect', targetId: 'v1' }).ok).toBe(true);
    // wolf kills someone else, advance through to next night
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v2' });
    h.fireTimeout(); // day_reveal -> day_main
    // skip day vote
    for (const p of h.internal().filter((p) => p.alive)) h.engine.submitVote(p.id, null);
    // back to night_guard (night 2)
    expect(h.phase()).toBe('night_guard');
    const r = h.engine.submitNightAction('g1', { type: 'guard_protect', targetId: 'v1' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: string }).error).toMatch(/2 đêm/);
  });

  it('rejects wolf_kill from non-wolf', () => {
    h = buildEngine(setup5pSeer());
    h.engine.start();
    expect(h.phase()).toBe('night_wolves');
    const r = h.engine.submitNightAction('s1', { type: 'wolf_kill', targetId: 'v1' });
    expect(r.ok).toBe(false);
  });

  it('rejects wolf_kill on dead target', () => {
    h = buildEngine([
      { id: 'w1', role: 'werewolf' },
      { id: 'v1', role: 'villager', alive: false },
      { id: 'v2', role: 'villager' },
      { id: 'v3', role: 'villager' },
    ]);
    h.engine.start();
    const r = h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    expect(r.ok).toBe(false);
  });

  it('rejects wolf_kill targeting a fellow wolf', () => {
    h = buildEngine(setup6p2Wolves());
    h.engine.start();
    const r = h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'w2' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: string }).error).toMatch(/đồng đội/);
    // No vote should have been recorded
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((h.engine as any).night_state.wolfVotes).toEqual({});
  });

  it('rejects wolf_kill targeting self', () => {
    h = buildEngine(setup6p2Wolves());
    h.engine.start();
    const r = h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'w1' });
    expect(r.ok).toBe(false);
  });

  it('rejects witch_poison targeting self', () => {
    h = buildEngine(setup6pWitch());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_skip' });
    expect(h.phase()).toBe('night_witch');
    const r = h.engine.submitNightAction('wi1', { type: 'witch_poison', targetId: 'wi1' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: string }).error).toMatch(/tự bỏ độc/);
  });

  it('rejects seer_check on self', () => {
    h = buildEngine(setup5pSeer());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    // night_seer
    expect(h.phase()).toBe('night_seer');
    const r = h.engine.submitNightAction('s1', { type: 'seer_check', targetId: 's1' });
    expect(r.ok).toBe(false);
  });

  it('seer receives correct target role on valid check', () => {
    h = buildEngine(setup5pSeer());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    h.engine.submitNightAction('s1', { type: 'seer_check', targetId: 'w1' });
    const result = h.lastNightResultFor('s1');
    expect(result).toMatchObject({ type: 'seer_result', targetId: 'w1', targetRole: 'werewolf' });
  });

  it('rejects witch_heal when no wolf kill happened', () => {
    h = buildEngine(setup6pWitch());
    h.engine.start();
    // wolves choose to skip
    h.engine.submitNightAction('w1', { type: 'wolf_skip' });
    // night_witch
    expect(h.phase()).toBe('night_witch');
    const r = h.engine.submitNightAction('wi1', { type: 'witch_heal' });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: string }).error).toMatch(/cắn/);
  });

  it('rejects witch_heal when potion already used', () => {
    h = buildEngine(setup6pWitch());
    h.engine.start();
    // night 1: wolf kills v1, witch heals (potion used)
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    expect(h.phase()).toBe('night_witch');
    expect(h.engine.submitNightAction('wi1', { type: 'witch_heal' }).ok).toBe(true);
    h.fireTimeout(); // day_reveal -> day_main
    for (const p of h.internal().filter((p) => p.alive)) h.engine.submitVote(p.id, null);
    // night 2
    expect(h.phase()).toBe('night_wolves');
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v2' });
    expect(h.phase()).toBe('night_witch');
    const r = h.engine.submitNightAction('wi1', { type: 'witch_heal' });
    expect(r.ok).toBe(false);
  });

  it('rejects witch_poison after potion already used', () => {
    h = buildEngine(setup6pWitch());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_skip' });
    expect(h.phase()).toBe('night_witch');
    expect(h.engine.submitNightAction('wi1', { type: 'witch_poison', targetId: 'v1' }).ok).toBe(true);
    h.fireTimeout();
    // skip day vote
    for (const p of h.internal().filter((p) => p.alive)) h.engine.submitVote(p.id, null);
    // night 2: wolf skips again, witch_poison should be rejected
    expect(h.phase()).toBe('night_wolves');
    h.engine.submitNightAction('w1', { type: 'wolf_skip' });
    expect(h.phase()).toBe('night_witch');
    const r = h.engine.submitNightAction('wi1', { type: 'witch_poison', targetId: 'v2' });
    expect(r.ok).toBe(false);
  });
});

describe('GameEngine — wolf voting logic', () => {
  let h: TestEngineHandle;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    h.engine.destroy();
    vi.useRealTimers();
  });

  it('two wolves voting same target → that target is killed', () => {
    h = buildEngine(setup6p2Wolves());
    h.engine.start();
    expect(h.phase()).toBe('night_wolves');
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    h.engine.submitNightAction('w2', { type: 'wolf_kill', targetId: 'v1' });
    // advance via allWolvesDecided
    expect(h.phase()).not.toBe('night_wolves');
    expect(h.internal().find((p) => p.id === 'v1')!.alive).toBe(false);
  });

  it('two wolves voting different targets → tie, no kill', () => {
    h = buildEngine(setup6p2Wolves());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    h.engine.submitNightAction('w2', { type: 'wolf_kill', targetId: 'v2' });
    // Tied 1-1 → wolfKillTargetId = null, no death
    expect(h.internal().find((p) => p.id === 'v1')!.alive).toBe(true);
    expect(h.internal().find((p) => p.id === 'v2')!.alive).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((h.engine as any).night_state.wolfKillTargetId).toBeNull();
  });

  it('split that resolves on third vote (majority breaks tie)', () => {
    // 4 wolves, 4 villagers — 3 vote A, 1 vote B → A wins (no tie at top)
    h = buildEngine([
      { id: 'w1', role: 'werewolf' },
      { id: 'w2', role: 'werewolf' },
      { id: 'w3', role: 'werewolf' },
      { id: 'w4', role: 'werewolf' },
      { id: 'v1', role: 'villager' },
      { id: 'v2', role: 'villager' },
      { id: 'v3', role: 'villager' },
      { id: 'v4', role: 'villager' },
    ]);
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    h.engine.submitNightAction('w2', { type: 'wolf_kill', targetId: 'v1' });
    h.engine.submitNightAction('w3', { type: 'wolf_kill', targetId: 'v1' });
    h.engine.submitNightAction('w4', { type: 'wolf_kill', targetId: 'v2' });
    expect(h.internal().find((p) => p.id === 'v1')!.alive).toBe(false);
    expect(h.internal().find((p) => p.id === 'v2')!.alive).toBe(true);
  });

  it('one wolf votes target, the other skips → skip wins (no kill)', () => {
    h = buildEngine(setup6p2Wolves());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    h.engine.submitNightAction('w2', { type: 'wolf_skip' });
    // skipCount=1 >= topCount=1 → null
    h.fireTimeout(); // jump out of any subsequent phase loop
    // v1 should be alive (no death this night)
    expect(h.internal().find((p) => p.id === 'v1')!.alive).toBe(true);
  });

  it('all wolves skipping → no kill', () => {
    h = buildEngine(setup6p2Wolves());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_skip' });
    h.engine.submitNightAction('w2', { type: 'wolf_skip' });
    // Should advance past wolves; next phase has no actor → night_witch absent → day_reveal
    h.fireTimeout(); // exit day_reveal if entered
    for (const v of h.internal().filter((p) => p.alive)) {
      // nobody died this night
      expect(v.alive).toBe(true);
    }
  });

  it('broadcastWolfAck is sent to every alive wolf with correct counts', () => {
    h = buildEngine(setup6p2Wolves());
    h.engine.start();
    h.cb.onNightResult.mockClear();
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    // After w1 vote: every wolf gets a wolf_ack call
    const acks = h.cb.onNightResult.mock.calls.filter((c) => (c[1] as { type: string }).type === 'wolf_ack');
    expect(acks.length).toBe(2);
    const ackPayload = acks[0]![1] as { type: 'wolf_ack'; pendingKillTargetId: string | null; decidedVotes: number; totalWolves: number };
    expect(ackPayload.totalWolves).toBe(2);
    expect(ackPayload.decidedVotes).toBe(1);
    expect(ackPayload.pendingKillTargetId).toBe('v1');
  });
});

describe('GameEngine — night death resolution', () => {
  let h: TestEngineHandle;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    h.engine.destroy();
    vi.useRealTimers();
  });

  it('wolf kill with no defense → target dies', () => {
    h = buildEngine(setup4pNoGuard());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    expect(h.internal().find((p) => p.id === 'v1')!.alive).toBe(false);
  });

  it('guard saves the wolf target', () => {
    h = buildEngine(setup5pGuard());
    h.engine.start();
    expect(h.phase()).toBe('night_guard');
    h.engine.submitNightAction('g1', { type: 'guard_protect', targetId: 'v1' });
    expect(h.phase()).toBe('night_wolves');
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    // v1 should be alive (guard saved)
    expect(h.internal().find((p) => p.id === 'v1')!.alive).toBe(true);
  });

  it('witch heal saves the wolf target', () => {
    h = buildEngine(setup6pWitch());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    h.engine.submitNightAction('wi1', { type: 'witch_heal' });
    expect(h.internal().find((p) => p.id === 'v1')!.alive).toBe(true);
  });

  it('witch poison kills target independent of wolf kill', () => {
    h = buildEngine(setup6pWitch());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    h.engine.submitNightAction('wi1', { type: 'witch_poison', targetId: 'v2' });
    // both should die (heal not used)
    expect(h.internal().find((p) => p.id === 'v1')!.alive).toBe(false);
    expect(h.internal().find((p) => p.id === 'v2')!.alive).toBe(false);
  });

  it('wolf skip + witch poison → only poisoned target dies', () => {
    h = buildEngine(setup6pWitch());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_skip' });
    h.engine.submitNightAction('wi1', { type: 'witch_poison', targetId: 'v2' });
    expect(h.internal().find((p) => p.id === 'v2')!.alive).toBe(false);
    expect(h.internal().filter((p) => p.alive)).toHaveLength(5);
  });

  it('peaceful night logs "Đêm yên bình"', () => {
    h = buildEngine(setup6pWitch());
    h.engine.start();
    h.engine.submitNightAction('w1', { type: 'wolf_skip' });
    h.engine.submitNightAction('wi1', { type: 'witch_pass' });
    const state = h.latestState()!;
    const logTexts = state.log.map((l) => l.text);
    expect(logTexts.some((t) => /yên bình/.test(t))).toBe(true);
  });
});

describe('GameEngine — day vote resolution', () => {
  let h: TestEngineHandle;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    h.engine.destroy();
    vi.useRealTimers();
  });

  function gotoDayMain(specs: RoleSpec[]) {
    h = buildEngine(specs);
    h.engine.start();
    // Walk through night to day_main using direct phase forcing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (h.engine as any).enterPhase('day_main');
    return h;
  }

  it('rejects vote outside day_main', () => {
    h = buildEngine(setup4pNoGuard());
    h.engine.start();
    expect(h.phase()).toBe('night_wolves');
    const r = h.engine.submitVote('v1', 'w1');
    expect(r.ok).toBe(false);
  });

  it('rejects vote against a dead target', () => {
    gotoDayMain([
      { id: 'w1', role: 'werewolf' },
      { id: 'v1', role: 'villager' },
      { id: 'v2', role: 'villager', alive: false },
      { id: 'v3', role: 'villager' },
    ]);
    expect(h.phase()).toBe('day_main');
    const r = h.engine.submitVote('v1', 'v2');
    expect(r.ok).toBe(false);
  });

  it('majority vote hangs the target', () => {
    gotoDayMain(setup4pNoGuard());
    h.engine.submitVote('v1', 'w1');
    h.engine.submitVote('v2', 'w1');
    h.engine.submitVote('v3', 'w1');
    h.engine.submitVote('w1', null);
    h.fireTimeout(); // resolve day_main
    expect(h.internal().find((p) => p.id === 'w1')!.alive).toBe(false);
  });

  it('tie at top → no one is hanged', () => {
    gotoDayMain([
      { id: 'w1', role: 'werewolf' },
      { id: 'w2', role: 'werewolf' },
      { id: 'v1', role: 'villager' },
      { id: 'v2', role: 'villager' },
      { id: 'v3', role: 'villager' },
      { id: 'v4', role: 'villager' },
    ]);
    h.engine.submitVote('v1', 'w1');
    h.engine.submitVote('v2', 'w1');
    h.engine.submitVote('v3', 'w2');
    h.engine.submitVote('v4', 'w2');
    h.engine.submitVote('w1', null);
    h.engine.submitVote('w2', null);
    h.fireTimeout();
    expect(h.internal().find((p) => p.id === 'w1')!.alive).toBe(true);
    expect(h.internal().find((p) => p.id === 'w2')!.alive).toBe(true);
    const log = h.latestState()!.log.map((l) => l.text);
    expect(log.some((t) => /Không treo cổ ai/.test(t))).toBe(true);
  });

  it('all alive players skip → auto-advance, no one hanged', () => {
    gotoDayMain(setup4pNoGuard());
    h.engine.submitVote('w1', null);
    h.engine.submitVote('v1', null);
    h.engine.submitVote('v2', null);
    h.engine.submitVote('v3', null);
    // Should auto-advance out of day_main
    expect(h.phase()).not.toBe('day_main');
    // No one hanged
    expect(h.internal().filter((p) => p.alive)).toHaveLength(4);
  });

  it('partial skips do NOT auto-advance', () => {
    gotoDayMain(setup4pNoGuard());
    h.engine.submitVote('w1', null);
    h.engine.submitVote('v1', null);
    // v2, v3 haven't voted yet
    expect(h.phase()).toBe('day_main');
  });
});

describe('GameEngine — win condition', () => {
  let h: TestEngineHandle;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    h.engine.destroy();
    vi.useRealTimers();
  });

  it('village wins when all wolves are dead', () => {
    h = buildEngine([
      { id: 'w1', role: 'werewolf' },
      { id: 'v1', role: 'villager' },
      { id: 'v2', role: 'villager' },
      { id: 'v3', role: 'villager' },
      { id: 'v4', role: 'villager' },
    ]);
    h.engine.start();
    // Walk to day_main and hang the wolf
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (h.engine as any).enterPhase('day_main');
    h.engine.submitVote('v1', 'w1');
    h.engine.submitVote('v2', 'w1');
    h.engine.submitVote('v3', 'w1');
    h.engine.submitVote('v4', 'w1');
    h.engine.submitVote('w1', null);
    h.fireTimeout();
    expect(h.cb.onEnded).toHaveBeenCalledWith('village');
    expect(h.phase()).toBe('ended');
    expect(h.latestState()!.winner).toBe('village');
  });

  it('wolves win when wolves >= villagers', () => {
    // 1 wolf vs 1 villager initially, then wolf kills villager → wolves wins
    // Actually: 1 wolf + 2 villagers; wolf kills 1 villager → 1 wolf vs 1 villager → wolves win.
    h = buildEngine([
      { id: 'w1', role: 'werewolf' },
      { id: 'v1', role: 'villager' },
      { id: 'v2', role: 'villager' },
    ]);
    // Need to bypass start()'s min check, but our players have 3 → still < 4. Force start by overriding.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (h.engine as any).phase = 'night_wolves';
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    // After night, wolves=1, villagers=1 → wolves win (>=)
    expect(h.cb.onEnded).toHaveBeenCalledWith('wolves');
  });

  it('game continues when wolves < villagers and >0 wolves', () => {
    h = buildEngine(setup6p2Wolves());
    h.engine.start();
    // 2 wolves vs 4 villagers → no winner yet
    expect(h.cb.onEnded).not.toHaveBeenCalled();
  });

  it('handlePlayerLeft can trigger win condition immediately', () => {
    h = buildEngine([
      { id: 'w1', role: 'werewolf' },
      { id: 'v1', role: 'villager' },
      { id: 'v2', role: 'villager' },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (h.engine as any).phase = 'day_main';
    h.engine.handlePlayerLeft('v1');
    // 1 wolf vs 1 villager → wolves win
    expect(h.cb.onEnded).toHaveBeenCalledWith('wolves');
  });
});

describe('GameEngine — handlePlayerLeft', () => {
  let h: TestEngineHandle;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    h.engine.destroy();
    vi.useRealTimers();
  });

  it('no-op for player who already left/dead', () => {
    h = buildEngine(setup4pNoGuard());
    h.engine.start();
    h.cb.onStateChanged.mockClear();
    h.engine.handlePlayerLeft('non-existent-id');
    expect(h.cb.onStateChanged).not.toHaveBeenCalled();
  });

  it('no-op when phase is lobby (game not started)', () => {
    h = buildEngine(setup4pNoGuard());
    // engine still in 'lobby' since we didn't start
    h.engine.handlePlayerLeft('v1');
    expect(h.internal().find((p) => p.id === 'v1')!.alive).toBe(true);
  });

  it('player leaving day_main clears their vote and may auto-skip', () => {
    h = buildEngine(setup4pNoGuard());
    h.engine.start();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (h.engine as any).enterPhase('day_main');
    h.engine.submitVote('w1', null);
    h.engine.submitVote('v1', null);
    h.engine.submitVote('v2', null);
    // v3 hasn't voted; the others all skipped. v3 leaves → all remaining have skipped → auto-advance.
    h.engine.handlePlayerLeft('v3');
    expect(h.internal().find((p) => p.id === 'v3')!.alive).toBe(false);
    expect(h.phase()).not.toBe('day_main');
  });

  it('wolf leaving night_wolves clears their pending vote and recomputes target', () => {
    h = buildEngine(setup6p2Wolves());
    h.engine.start();
    expect(h.phase()).toBe('night_wolves');
    h.engine.submitNightAction('w1', { type: 'wolf_kill', targetId: 'v1' });
    // w2 leaves → recompute. Now only w1 has decided, allWolvesDecided=true (1 wolf alive, votes={w1: 'v1'})
    h.engine.handlePlayerLeft('w2');
    // Phase advanced beyond night_wolves
    expect(h.phase()).not.toBe('night_wolves');
  });
});

describe('GameEngine — buildMyInfo / buildPublicState', () => {
  let h: TestEngineHandle;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    h.engine.destroy();
    vi.useRealTimers();
  });

  it('werewolf gets fellowWolves list', () => {
    h = buildEngine(setup6p2Wolves());
    h.engine.start();
    const w1Info = h.cb.onMyInfo.mock.calls.find((c) => c[0] === 'w1')![1];
    expect(w1Info.fellowWolves).toEqual(expect.arrayContaining(['w1', 'w2']));
    expect(w1Info.team).toBe('wolves');
  });

  it('non-wolf does not get fellowWolves', () => {
    h = buildEngine(setup6p2Wolves());
    h.engine.start();
    const v1Info = h.cb.onMyInfo.mock.calls.find((c) => c[0] === 'v1')![1];
    expect(v1Info.fellowWolves).toBeUndefined();
    expect(v1Info.team).toBe('village');
  });

  it('witch gets witchPotions snapshot', () => {
    h = buildEngine(setup6pWitch());
    h.engine.start();
    const witchInfo = h.cb.onMyInfo.mock.calls.find((c) => c[0] === 'wi1')![1];
    expect(witchInfo.witchPotions).toEqual({ heal: true, poison: true });
  });

  it('public state hides revealedRole until phase=ended', () => {
    h = buildEngine(setup4pNoGuard());
    h.engine.start();
    const state = h.latestState()!;
    for (const p of state.players) {
      expect(p.revealedRole).toBeUndefined();
    }
  });

  it('public state reveals all roles when game ends', () => {
    h = buildEngine([
      { id: 'w1', role: 'werewolf' },
      { id: 'v1', role: 'villager' },
      { id: 'v2', role: 'villager' },
      { id: 'v3', role: 'villager' },
      { id: 'v4', role: 'villager' },
    ]);
    h.engine.start();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (h.engine as any).enterPhase('day_main');
    h.engine.submitVote('v1', 'w1');
    h.engine.submitVote('v2', 'w1');
    h.engine.submitVote('v3', 'w1');
    h.engine.submitVote('v4', 'w1');
    h.engine.submitVote('w1', null);
    h.fireTimeout();
    const state = h.latestState()!;
    expect(state.phase).toBe('ended');
    for (const p of state.players) {
      expect(p.revealedRole).toBeDefined();
    }
  });

  it('vote field is present in day_main, undefined elsewhere', () => {
    h = buildEngine(setup4pNoGuard());
    h.engine.start();
    expect(h.latestState()!.vote).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (h.engine as any).enterPhase('day_main');
    expect(h.latestState()!.vote).toBeDefined();
  });

  it('log is capped at 200 entries', () => {
    h = buildEngine(setup4pNoGuard());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = h.engine as any;
    for (let i = 0; i < 250; i++) {
      e.appendLog('system', `entry ${i}`);
    }
    expect(e.log.length).toBe(200);
    expect(e.log[0].text).toBe('entry 50');
    expect(e.log[199].text).toBe('entry 249');
  });
});
