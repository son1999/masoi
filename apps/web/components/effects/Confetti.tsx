'use client';

import { useMemo } from 'react';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#ec4899', '#fbbf24'];
const COUNT = 60;

export default function Confetti() {
  const pieces = useMemo(() => {
    return Array.from({ length: COUNT }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 2000,
      duration: 2500 + Math.random() * 2500,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotate: Math.random() * 360,
    }));
  }, []);

  return (
    <div className="confetti-overlay" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}ms`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
