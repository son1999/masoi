'use client';

import type { AuthSession } from '@ma-soi/shared';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000';
const STORAGE_KEY = 'ma-soi.session';

export async function login(nickname: string): Promise<AuthSession> {
  const res = await fetch(`${SERVER_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? 'Đăng nhập thất bại');
  }
  const session = json.data as AuthSession;
  saveSession(session);
  return session;
}

export function loadSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(STORAGE_KEY);
}
