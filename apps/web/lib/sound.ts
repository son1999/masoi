'use client';

import { useSyncExternalStore } from 'react';

export type SoundKey =
  | 'wolf_howl'
  | 'rooster'
  | 'birds_morning'
  | 'countdown_tick'
  | 'countdown_final'
  | 'death_scream'
  | 'gavel'
  | 'magic_chime'
  | 'heal'
  | 'poison'
  | 'victory_village'
  | 'victory_wolves'
  | 'phase_bell';

const ALL_KEYS: SoundKey[] = [
  'wolf_howl',
  'rooster',
  'birds_morning',
  'countdown_tick',
  'countdown_final',
  'death_scream',
  'gavel',
  'magic_chime',
  'heal',
  'poison',
  'victory_village',
  'victory_wolves',
  'phase_bell',
];

const POOL_SIZE = 3;
const LS_MUTED = 'ma-soi:sound:muted';
const LS_VOLUME = 'ma-soi:sound:volume';

class SoundManager {
  private pools = new Map<SoundKey, HTMLAudioElement[]>();
  private cursor = new Map<SoundKey, number>();
  private muted = false;
  private volume = 0.7;
  private unlocked = false;
  private initialized = false;
  private listeners = new Set<() => void>();

  init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;
    try {
      const m = localStorage.getItem(LS_MUTED);
      if (m !== null) this.muted = m === '1';
      const v = localStorage.getItem(LS_VOLUME);
      if (v !== null) {
        const n = parseFloat(v);
        if (Number.isFinite(n)) this.volume = Math.min(1, Math.max(0, n));
      }
    } catch {}
    this.preload(ALL_KEYS);
  }

  private getPool(key: SoundKey): HTMLAudioElement[] {
    let pool = this.pools.get(key);
    if (!pool) {
      pool = [];
      for (let i = 0; i < POOL_SIZE; i++) {
        const a = new Audio(`/sounds/${key}.mp3`);
        a.preload = 'auto';
        pool.push(a);
      }
      this.pools.set(key, pool);
      this.cursor.set(key, 0);
    }
    return pool;
  }

  preload(keys: SoundKey[]) {
    if (typeof window === 'undefined') return;
    for (const k of keys) this.getPool(k);
  }

  unlock() {
    if (this.unlocked || typeof window === 'undefined') return;
    this.unlocked = true;
    // Touch one audio in each pool to satisfy autoplay gate.
    for (const key of ALL_KEYS) {
      const pool = this.getPool(key);
      const a = pool[0];
      if (!a) continue;
      const prev = a.volume;
      a.volume = 0;
      a.play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
          a.volume = prev;
        })
        .catch(() => {
          a.volume = prev;
        });
    }
  }

  play(key: SoundKey, opts?: { volume?: number; delay?: number }) {
    if (typeof window === 'undefined') return;
    if (this.muted) return;
    const run = () => {
      const pool = this.getPool(key);
      const idx = (this.cursor.get(key) ?? 0) % pool.length;
      this.cursor.set(key, idx + 1);
      const a = pool[idx];
      if (!a) return;
      try {
        a.currentTime = 0;
      } catch {}
      a.volume = Math.min(1, Math.max(0, this.volume * (opts?.volume ?? 1)));
      a.play().catch(() => {
        // Missing file or autoplay blocked: fail silently.
      });
    };
    if (opts?.delay && opts.delay > 0) setTimeout(run, opts.delay);
    else run();
  }

  setMuted(m: boolean) {
    if (this.muted === m) return;
    this.muted = m;
    try {
      localStorage.setItem(LS_MUTED, m ? '1' : '0');
    } catch {}
    if (m) {
      // Stop everything currently playing.
      for (const pool of this.pools.values()) {
        for (const a of pool) {
          if (!a.paused) {
            a.pause();
            try {
              a.currentTime = 0;
            } catch {}
          }
        }
      }
    }
    this.emit();
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  setVolume(v: number) {
    const clamped = Math.min(1, Math.max(0, v));
    if (this.volume === clamped) return;
    this.volume = clamped;
    try {
      localStorage.setItem(LS_VOLUME, String(clamped));
    } catch {}
    this.emit();
  }

  isMuted() {
    return this.muted;
  }
  getVolume() {
    return this.volume;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

export const sound = new SoundManager();

// === Effect bus (cross-component visual triggers) ===

export type FxName = 'heal' | 'poison';

type FxListener = (name: FxName) => void;
const fxListeners = new Set<FxListener>();

export const fxBus = {
  emit(name: FxName) {
    for (const fn of fxListeners) fn(name);
  },
  on(fn: FxListener): () => void {
    fxListeners.add(fn);
    return () => {
      fxListeners.delete(fn);
    };
  },
};

// === React hook ===

interface SoundSnapshot {
  muted: boolean;
  volume: number;
}

let cachedSnapshot: SoundSnapshot = { muted: false, volume: 0.7 };

function getSnapshot(): SoundSnapshot {
  const m = sound.isMuted();
  const v = sound.getVolume();
  if (cachedSnapshot.muted !== m || cachedSnapshot.volume !== v) {
    cachedSnapshot = { muted: m, volume: v };
  }
  return cachedSnapshot;
}

function getServerSnapshot(): SoundSnapshot {
  return cachedSnapshot;
}

export function useSoundSettings() {
  return useSyncExternalStore((cb) => sound.subscribe(cb), getSnapshot, getServerSnapshot);
}
