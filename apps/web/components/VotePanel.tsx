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
  const myVote = state.vote?.votes[myPlayerId] ?? undefined;

  const tally = useMemo(() => {
    const t: Record<string, string[]> = {};
    if (!state.vote) return t;
    for (const [voter, target] of Object.entries(state.vote.votes)) {
      if (target) {
        if (!t[target]) t[target] = [];
        t[target]!.push(voter);
      }
    }
    return t;
  }, [state.vote]);

  if (!me?.alive) {
    return null;
  }

  function vote(targetId: string | null) {
    if (!socket) return;
    socket.emit('game:vote', { targetId }, () => {});
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="mb-3 text-sm font-semibold">⚖️ Bỏ phiếu treo cổ</div>
      <ul className="space-y-1.5">
        {state.players
          .filter((p) => p.alive && p.id !== myPlayerId)
          .map((p) => {
            const voters = tally[p.id] ?? [];
            const isMyVote = myVote === p.id;
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
      {myVote && (
        <button
          type="button"
          onClick={() => vote(null)}
          className="mt-3 w-full rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition"
        >
          Hủy phiếu
        </button>
      )}
    </div>
  );
}
