'use client';

import { useMemo } from 'react';
import type { GameStatePublic } from '@ma-soi/shared';
import type { GameSocket } from '@/lib/socket';

interface Props {
  socket: GameSocket | null;
  state: GameStatePublic;
  myPlayerId: string;
}

export default function VotePanel({ socket, state, myPlayerId }: Props) {
  const me = state.players.find((p) => p.id === myPlayerId);
  const votes = state.vote?.votes ?? {};
  const hasVoted = myPlayerId in votes;
  const myVote = hasVoted ? votes[myPlayerId] : undefined;
  const mySkipped = hasVoted && myVote === null;
  const myTarget = typeof myVote === 'string' ? myVote : null;

  const aliveIds = useMemo(
    () => new Set(state.players.filter((p) => p.alive).map((p) => p.id)),
    [state.players],
  );
  const aliveCount = aliveIds.size;
  const skipCount = useMemo(
    () =>
      Object.entries(votes).filter(([id, v]) => v === null && aliveIds.has(id)).length,
    [votes, aliveIds],
  );

  const tally = useMemo(() => {
    const t: Record<string, string[]> = {};
    for (const [voter, target] of Object.entries(votes)) {
      if (target) {
        if (!t[target]) t[target] = [];
        t[target]!.push(voter);
      }
    }
    return t;
  }, [votes]);

  if (!me?.alive) return null;

  function vote(targetId: string | null) {
    if (!socket) return;
    socket.emit('game:vote', { targetId }, () => {});
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">⚖️ Bỏ phiếu treo cổ</div>
        <div className="text-xs text-neutral-400">
          🤝 Bỏ qua: <span className="font-mono text-emerald-300">{skipCount}/{aliveCount}</span>
        </div>
      </div>

      <ul className="space-y-1.5">
        {state.players
          .filter((p) => p.alive && p.id !== myPlayerId)
          .map((p) => {
            const voters = tally[p.id] ?? [];
            const isMyVote = myTarget === p.id;
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm transition cursor-pointer ${
                  isMyVote
                    ? 'border-rose-500 bg-rose-500/10'
                    : 'border-neutral-800 bg-neutral-950 hover:border-neutral-600'
                }`}
                onClick={() => vote(isMyVote ? null : p.id)}
              >
                <span>{p.nickname}</span>
                <span className="flex items-center gap-2 text-xs text-neutral-400">
                  {voters.length > 0 && <span>{voters.length} phiếu</span>}
                  {isMyVote && <span className="text-rose-300">✓ phiếu của bạn</span>}
                </span>
              </li>
            );
          })}
      </ul>

      <button
        type="button"
        onClick={() => vote(null)}
        disabled={mySkipped}
        className={`mt-3 w-full rounded-md border px-3 py-2 text-sm font-medium transition ${
          mySkipped
            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200 cursor-default'
            : 'border-emerald-600 bg-emerald-600/10 text-emerald-300 hover:bg-emerald-600/20'
        }`}
      >
        {mySkipped ? '✓ Bạn đã đồng ý bỏ qua' : '🤝 Đồng ý bỏ qua (skip)'}
      </button>

      {!hasVoted && (
        <p className="mt-2 text-center text-xs text-neutral-500">Chưa quyết định</p>
      )}

      {skipCount === aliveCount && aliveCount > 0 && (
        <p className="mt-2 text-center text-xs text-emerald-400 animate-pulse">
          ✨ Tất cả đã đồng ý — đang bỏ qua…
        </p>
      )}
    </div>
  );
}
