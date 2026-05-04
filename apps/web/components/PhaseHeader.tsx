'use client';

import { useEffect, useState } from 'react';
import type { GamePhase } from '@ma-soi/shared';

const PHASE_LABELS: Record<GamePhase, { label: string; emoji: string; color: string }> = {
  lobby: { label: 'Phòng chờ', emoji: '⏳', color: 'text-neutral-300' },
  night_guard: { label: 'Đêm — Bảo vệ', emoji: '🛡️', color: 'text-amber-300' },
  night_wolves: { label: 'Đêm — Sói', emoji: '🐺', color: 'text-rose-400' },
  night_seer: { label: 'Đêm — Tiên tri', emoji: '🔮', color: 'text-sky-300' },
  night_witch: { label: 'Đêm — Phù thủy', emoji: '🧪', color: 'text-fuchsia-300' },
  day_reveal: { label: 'Bình minh', emoji: '🌅', color: 'text-amber-200' },
  day_main: { label: 'Ngày — Thảo luận & Bỏ phiếu', emoji: '☀️', color: 'text-yellow-200' },
  ended: { label: 'Kết thúc', emoji: '🏁', color: 'text-emerald-300' },
};

interface Props {
  phase: GamePhase;
  night: number;
  phaseEndsAt: number | null;
}

export default function PhaseHeader({ phase, night, phaseEndsAt }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!phaseEndsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [phaseEndsAt]);

  const meta = PHASE_LABELS[phase];
  const remaining = phaseEndsAt ? Math.max(0, Math.ceil((phaseEndsAt - now) / 1000)) : null;
  const lowTime = remaining !== null && remaining <= 10;

  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
      <div>
        <div className="text-xs text-neutral-500">{phase === 'lobby' ? '' : `Đêm thứ ${night}`}</div>
        <div className={`text-lg font-bold ${meta.color}`}>
          {meta.emoji} {meta.label}
        </div>
      </div>
      {remaining !== null && (
        <div
          className={`font-mono text-2xl font-bold ${lowTime ? 'animate-pulse text-rose-400' : 'text-neutral-200'}`}
        >
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
        </div>
      )}
    </div>
  );
}
