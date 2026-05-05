'use client';

import { sound, useSoundSettings } from '@/lib/sound';

export default function SoundToggle() {
  const { muted, volume } = useSoundSettings();

  return (
    <div className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-1.5">
      <button
        type="button"
        onClick={() => sound.toggleMute()}
        className="text-lg leading-none transition hover:scale-110"
        title={muted ? 'Bật âm' : 'Tắt âm'}
        aria-label={muted ? 'Bật âm' : 'Tắt âm'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(volume * 100)}
        onChange={(e) => sound.setVolume(Number(e.target.value) / 100)}
        disabled={muted}
        className="h-1 w-20 cursor-pointer accent-emerald-500 disabled:opacity-40"
        title={`Âm lượng ${Math.round(volume * 100)}%`}
      />
    </div>
  );
}
