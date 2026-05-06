import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { validateNickname, issueSession, verifyToken } from '../auth.js';

describe('validateNickname', () => {
  it('rejects non-string input', () => {
    expect(validateNickname(undefined)).toEqual({ error: expect.any(String) });
    expect(validateNickname(null)).toEqual({ error: expect.any(String) });
    expect(validateNickname(42)).toEqual({ error: expect.any(String) });
    expect(validateNickname({})).toEqual({ error: expect.any(String) });
    expect(validateNickname([])).toEqual({ error: expect.any(String) });
  });

  it('rejects empty string', () => {
    const r = validateNickname('');
    expect(typeof r).toBe('object');
    expect((r as { error: string }).error).toMatch(/tối thiểu/);
  });

  it('rejects whitespace-only (trims to empty)', () => {
    const r = validateNickname('   ');
    expect(typeof r).toBe('object');
    expect((r as { error: string }).error).toMatch(/tối thiểu/);
  });

  it('rejects 1-character nickname (below min=2)', () => {
    const r = validateNickname('a');
    expect(typeof r).toBe('object');
    expect((r as { error: string }).error).toMatch(/tối thiểu/);
  });

  it('rejects nicknames longer than 20 chars', () => {
    const r = validateNickname('a'.repeat(21));
    expect(typeof r).toBe('object');
    expect((r as { error: string }).error).toMatch(/tối đa/);
  });

  it('accepts a 2-character nickname (boundary)', () => {
    expect(validateNickname('ab')).toBe('ab');
  });

  it('accepts a 20-character nickname (boundary)', () => {
    const s = 'a'.repeat(20);
    expect(validateNickname(s)).toBe(s);
  });

  it('trims surrounding whitespace and returns trimmed string', () => {
    expect(validateNickname('  Alice  ')).toBe('Alice');
  });

  it('accepts unicode nicknames within length bounds', () => {
    expect(validateNickname('Sói Đen')).toBe('Sói Đen');
  });
});

describe('issueSession + verifyToken (round-trip)', () => {
  it('issued token decodes back to original claims', () => {
    const session = issueSession('Alice');
    expect(session.nickname).toBe('Alice');
    expect(typeof session.playerId).toBe('string');
    expect(session.playerId.length).toBeGreaterThan(0);
    expect(typeof session.token).toBe('string');

    const claims = verifyToken(session.token);
    expect(claims).not.toBeNull();
    expect(claims!.nickname).toBe('Alice');
    expect(claims!.playerId).toBe(session.playerId);
  });

  it('two sessions get different playerIds', () => {
    const a = issueSession('A');
    const b = issueSession('B');
    expect(a.playerId).not.toBe(b.playerId);
  });

  it('rejects empty/garbage token', () => {
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('not-a-jwt')).toBeNull();
    expect(verifyToken('aaa.bbb.ccc')).toBeNull();
  });

  it('rejects tampered token (signature mismatch)', () => {
    const session = issueSession('Bob');
    const tampered = session.token.slice(0, -2) + (session.token.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(verifyToken(tampered)).toBeNull();
  });

  it('rejects token signed with a different secret', () => {
    const fake = jwt.sign(
      { playerId: 'fake-id', nickname: 'Mallory' },
      'a-totally-different-secret',
      { expiresIn: 3600 },
    );
    expect(verifyToken(fake)).toBeNull();
  });

  it('rejects token whose payload is missing required claims', () => {
    // Sign with default secret used by auth.ts when JWT_SECRET is unset
    const secret = process.env.JWT_SECRET ?? 'dev-secret-change-in-prod';
    const noNickname = jwt.sign({ playerId: 'x' }, secret, { expiresIn: 3600 });
    const noPlayerId = jwt.sign({ nickname: 'x' }, secret, { expiresIn: 3600 });
    expect(verifyToken(noNickname)).toBeNull();
    expect(verifyToken(noPlayerId)).toBeNull();
  });
});
