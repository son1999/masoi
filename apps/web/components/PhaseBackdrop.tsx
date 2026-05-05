'use client';

import { useEffect, useRef, useState } from 'react';
import type { GamePhase } from '@ma-soi/shared';
import Bats from './effects/Bats';

type Category = 'lobby' | 'night' | 'day' | 'ended';

function categorize(phase: GamePhase | null): Category {
  if (!phase || phase === 'lobby') return 'lobby';
  if (phase.startsWith('night_')) return 'night';
  if (phase === 'day_reveal' || phase === 'day_main') return 'day';
  return 'ended';
}

const CATEGORY_CLASS: Record<Category, string> = {
  lobby: 'phase-bg-lobby',
  night: 'phase-bg-night',
  day: 'phase-bg-day',
  ended: 'phase-bg-ended',
};

export default function PhaseBackdrop({ phase }: { phase: GamePhase | null }) {
  const [category, setCategory] = useState<Category>(() => categorize(phase));
  const [flash, setFlash] = useState<'sunrise' | 'sunset' | null>(null);
  const prevRef = useRef<Category>(category);

  useEffect(() => {
    const next = categorize(phase);
    if (next === prevRef.current) return;

    if (prevRef.current === 'night' && next === 'day') setFlash('sunrise');
    else if (prevRef.current === 'day' && next === 'night') setFlash('sunset');
    else if (prevRef.current === 'lobby' && next === 'night') setFlash('sunset');

    prevRef.current = next;
    setCategory(next);

    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <>
      <div className={`phase-bg ${CATEGORY_CLASS[category]}`} aria-hidden />
      {category === 'night' && <div className="phase-stars" aria-hidden />}
      {category === 'night' && <div className="phase-moon" aria-hidden />}
      {category === 'night' && <Bats />}
      {phase === 'night_wolves' && <div className="phase-vignette-wolf" aria-hidden />}
      {category === 'day' && <div className="phase-sun" aria-hidden />}
      {flash === 'sunrise' && <div className="phase-flash phase-flash-sunrise" aria-hidden />}
      {flash === 'sunset' && <div className="phase-flash phase-flash-sunset" aria-hidden />}
    </>
  );
}
