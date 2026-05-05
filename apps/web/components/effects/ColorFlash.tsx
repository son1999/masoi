'use client';

import { useEffect, useState } from 'react';

interface Props {
  kind: 'heal' | 'poison' | null;
  triggerKey: number;
}

export default function ColorFlash({ kind, triggerKey }: Props) {
  const [active, setActive] = useState<'heal' | 'poison' | null>(null);

  useEffect(() => {
    if (!triggerKey || !kind) return;
    setActive(kind);
    const t = setTimeout(() => setActive(null), 1200);
    return () => clearTimeout(t);
  }, [triggerKey, kind]);

  if (!active) return null;
  return (
    <div
      key={triggerKey}
      className={`color-flash ${active === 'heal' ? 'color-flash-heal' : 'color-flash-poison'}`}
      aria-hidden
    />
  );
}
