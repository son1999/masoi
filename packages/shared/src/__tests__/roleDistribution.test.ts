import { describe, it, expect } from 'vitest';
import {
  computeRoleDistribution,
  roleTeam,
  MIN_PLAYERS_TO_START,
  type RoleId,
} from '../index.js';

describe('computeRoleDistribution', () => {
  it('n=4: 1 wolf + 3 villagers, no specials', () => {
    const d = computeRoleDistribution(4);
    expect(d).toEqual({ werewolf: 1, seer: 0, witch: 0, guard: 0, villager: 3 });
  });

  it('n=5: adds seer', () => {
    const d = computeRoleDistribution(5);
    expect(d.seer).toBe(1);
    expect(d.witch).toBe(0);
    expect(d.guard).toBe(0);
    expect(d.werewolf).toBe(1);
    expect(d.villager).toBe(3);
  });

  it('n=6: adds witch on top of seer', () => {
    const d = computeRoleDistribution(6);
    expect(d.witch).toBe(1);
    expect(d.seer).toBe(1);
    expect(d.guard).toBe(0);
    expect(d.werewolf).toBe(1);
    expect(d.villager).toBe(3);
  });

  it('n=7: adds guard', () => {
    const d = computeRoleDistribution(7);
    expect(d.guard).toBe(1);
    expect(d.witch).toBe(1);
    expect(d.seer).toBe(1);
    expect(d.werewolf).toBe(1);
    expect(d.villager).toBe(3);
  });

  it('n=8: 2 wolves (floor(8/4))', () => {
    const d = computeRoleDistribution(8);
    expect(d.werewolf).toBe(2);
  });

  it('n=12: 3 wolves and full specials, total adds up', () => {
    const d = computeRoleDistribution(12);
    expect(d.werewolf).toBe(3);
    expect(d.seer).toBe(1);
    expect(d.witch).toBe(1);
    expect(d.guard).toBe(1);
    expect(d.villager).toBe(6);
    const total = d.werewolf + d.seer + d.witch + d.guard + d.villager;
    expect(total).toBe(12);
  });

  it('invariant: for any n in [MIN_PLAYERS_TO_START..20], total equals n and werewolf >= 1', () => {
    for (let n = MIN_PLAYERS_TO_START; n <= 20; n++) {
      const d = computeRoleDistribution(n);
      const total = d.werewolf + d.seer + d.witch + d.guard + d.villager;
      expect(total, `total for n=${n}`).toBe(n);
      expect(d.werewolf, `werewolf for n=${n}`).toBeGreaterThanOrEqual(1);
      expect(d.villager, `villager for n=${n}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('n=0 still returns at least 1 wolf (Math.max guard)', () => {
    const d = computeRoleDistribution(0);
    expect(d.werewolf).toBe(1);
    expect(d.villager).toBe(0);
  });
});

describe('roleTeam', () => {
  it('werewolf -> wolves', () => {
    expect(roleTeam('werewolf')).toBe('wolves');
  });

  it('every non-werewolf role -> village', () => {
    const others: RoleId[] = ['villager', 'seer', 'witch', 'guard'];
    for (const r of others) {
      expect(roleTeam(r), `team for ${r}`).toBe('village');
    }
  });
});
