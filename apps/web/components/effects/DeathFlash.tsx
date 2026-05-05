'use client';

import { useEffect, useState } from 'react';

export default function DeathFlash({ triggerKey }: { triggerKey: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!triggerKey) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(t);
  }, [triggerKey]);

  if (!visible) return null;
  return <div key={triggerKey} className="death-pop" aria-hidden />;
}
