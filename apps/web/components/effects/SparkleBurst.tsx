'use client';

import { useEffect, useMemo, useState } from 'react';

const COUNT = 14;

export default function SparkleBurst({ triggerKey }: { triggerKey: number }) {
  const [visible, setVisible] = useState(false);

  const sparkles = useMemo(() => {
    return Array.from({ length: COUNT }, () => ({
      top: Math.random() * 80 + 10,
      left: Math.random() * 90 + 5,
      delay: Math.random() * 600,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  useEffect(() => {
    if (!triggerKey) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(t);
  }, [triggerKey]);

  if (!visible) return null;
  return (
    <div key={triggerKey} className="sparkle-overlay" aria-hidden>
      {sparkles.map((s, i) => (
        <span
          key={i}
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            animationDelay: `${s.delay}ms`,
          }}
        >
          ✨
        </span>
      ))}
    </div>
  );
}
