'use client';

import type { AuthSession } from '@ma-soi/shared';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000';
const SESSION_KEY = 'ma-soi.session';
const HEARTBEAT_KEY = 'ma-soi.heartbeat';
const HEARTBEAT_INTERVAL_MS = 2000;
const HEARTBEAT_STALE_MS = 5000;

// Strategy: localStorage giữ session (chia sẻ giữa các tab cùng browser);
// mỗi tab tick "heartbeat" 2s/lần. Khi mở tab mới mà heartbeat đã quá hạn 5s,
// nghĩa là không tab anh em nào còn sống → coi đây là phiên browser mới và xoá session.

let heartbeatStarted = false;

function startHeartbeat() {
  if (typeof window === 'undefined' || heartbeatStarted) return;
  heartbeatStarted = true;
  const tick = () => {
    try {
      window.localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
    } catch {}
  };
  tick();
  setInterval(tick, HEARTBEAT_INTERVAL_MS);
}

function siblingTabAlive(): boolean {
  try {
    const raw = window.localStorage.getItem(HEARTBEAT_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < HEARTBEAT_STALE_MS;
  } catch {
    return false;
  }
}

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

  // Tab này đã từng load (F5 hay điều hướng nội bộ) → đã có heartbeat → đọc localStorage.
  // Tab mới toanh → kiểm tra có tab anh em nào đang heartbeat không. Nếu không → reset.
  if (!heartbeatStarted && !siblingTabAlive()) {
    window.localStorage.removeItem(SESSION_KEY);
    startHeartbeat();
    return null;
  }
  startHeartbeat();

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession) {
  startHeartbeat();
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
