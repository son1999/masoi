'use client';

import { useEffect, useRef } from 'react';
import type { PublicLogEntry } from '@ma-soi/shared';

interface Props {
  log: PublicLogEntry[];
}

const KIND_STYLE: Record<PublicLogEntry['kind'], string> = {
  phase: 'text-neutral-300',
  death: 'text-rose-300',
  win: 'font-bold text-emerald-300',
  vote: 'text-amber-300',
  system: 'text-neutral-500',
};

export default function GameLog({ log }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length]);

  return (
    <div
      ref={ref}
      className="max-h-[40vh] overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900/30 p-3 text-xs"
    >
      {log.length === 0 ? (
        <p className="text-neutral-500">Nhật ký trống</p>
      ) : (
        <ul className="space-y-1">
          {log.map((e) => (
            <li key={e.id} className={KIND_STYLE[e.kind]}>
              {e.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
