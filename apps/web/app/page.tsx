'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, loadSession, login } from '@/lib/auth';
import { disconnectSocket, getSocket } from '@/lib/socket';
import type { AuthSession } from '@ma-soi/shared';

export default function HomePage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(loadSession());
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const s = await login(nickname.trim());
      setSession(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    disconnectSocket();
    clearSession();
    setSession(null);
  }

  async function createRoom() {
    if (!session) return;
    setError(null);
    setBusy(true);
    const socket = getSocket(session.token);
    socket.emit('room:create', (res) => {
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/room/${res.data.id}`);
    });
  }

  async function joinRoom(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);
    setBusy(true);
    const socket = getSocket(session.token);
    const code = joinCode.trim().toUpperCase();
    socket.emit('room:join', { joinCode: code }, (res) => {
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/room/${res.data.id}`);
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <header className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">🐺 Ma Sói</h1>
        <p className="mt-2 text-sm text-neutral-400">Werewolves of Millers Hollow — online</p>
      </header>

      {!session ? (
        <form
          onSubmit={handleLogin}
          className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-6"
        >
          <label className="text-sm text-neutral-300">Nickname</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            minLength={2}
            maxLength={20}
            placeholder="Tên của bạn"
            className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-emerald-500 transition"
          >
            {busy ? 'Đang vào…' : 'Vào game'}
          </button>
          {error && <p className="text-xs text-rose-400">{error}</p>}
        </form>
      ) : (
        <div className="flex w-full max-w-sm flex-col gap-4">
          <div className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900/50 px-4 py-2 text-sm">
            <span>
              Xin chào, <span className="font-semibold text-emerald-400">{session.nickname}</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="text-xs text-neutral-400 hover:text-rose-400 transition"
            >
              Đổi tên
            </button>
          </div>

          <button
            type="button"
            onClick={createRoom}
            disabled={busy}
            className="rounded-md bg-emerald-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40 hover:bg-emerald-500 transition"
          >
            Tạo phòng mới
          </button>

          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="h-px flex-1 bg-neutral-800" />
            <span>hoặc</span>
            <span className="h-px flex-1 bg-neutral-800" />
          </div>

          <form onSubmit={joinRoom} className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <label className="text-sm text-neutral-300">Mã phòng (6 ký tự)</label>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm uppercase tracking-widest focus:border-emerald-500 focus:outline-none"
              required
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-neutral-700 transition"
            >
              Vào phòng
            </button>
          </form>

          {error && <p className="text-center text-xs text-rose-400">{error}</p>}
        </div>
      )}
    </main>
  );
}
