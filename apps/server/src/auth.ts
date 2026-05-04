import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { NICKNAME_MAX, NICKNAME_MIN, type AuthSession } from '@ma-soi/shared';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-prod';
const JWT_TTL_SECONDS = 60 * 60 * 24 * 7;

interface TokenClaims {
  playerId: string;
  nickname: string;
}

export function validateNickname(raw: unknown): string | { error: string } {
  if (typeof raw !== 'string') return { error: 'Nickname phải là chuỗi' };
  const trimmed = raw.trim();
  if (trimmed.length < NICKNAME_MIN) return { error: `Nickname tối thiểu ${NICKNAME_MIN} ký tự` };
  if (trimmed.length > NICKNAME_MAX) return { error: `Nickname tối đa ${NICKNAME_MAX} ký tự` };
  return trimmed;
}

export function issueSession(nickname: string): AuthSession {
  const playerId = randomUUID();
  const claims: TokenClaims = { playerId, nickname };
  const token = jwt.sign(claims, JWT_SECRET, { expiresIn: JWT_TTL_SECONDS });
  return { playerId, nickname, token };
}

export function verifyToken(token: string): TokenClaims | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded !== 'object' || decoded === null) return null;
    const { playerId, nickname } = decoded as Record<string, unknown>;
    if (typeof playerId !== 'string' || typeof nickname !== 'string') return null;
    return { playerId, nickname };
  } catch {
    return null;
  }
}
