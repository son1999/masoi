'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameStatePublic, NightActionResult } from '@ma-soi/shared';
import { sound, fxBus, type FxName } from '@/lib/sound';
import DeathFlash from './effects/DeathFlash';
import SparkleBurst from './effects/SparkleBurst';
import ColorFlash from './effects/ColorFlash';
import Confetti from './effects/Confetti';
import WolvesParade from './effects/WolvesParade';

interface Props {
  gameState: GameStatePublic | null;
  lastNightResult: NightActionResult | null;
}

export default function EffectsLayer({ gameState, lastNightResult }: Props) {
  const prevPhaseRef = useRef<string | null>(null);
  const lastLogIdRef = useRef<string | null>(null);
  const initLogRef = useRef(false);
  const lastVoteCountRef = useRef(0);
  const lastSeerKeyRef = useRef<string | null>(null);
  const lastTickedSecRef = useRef<number | null>(null);

  const [deathKey, setDeathKey] = useState(0);
  const [sparkleKey, setSparkleKey] = useState(0);
  const [flashKind, setFlashKind] = useState<FxName | null>(null);
  const [flashKey, setFlashKey] = useState(0);

  // 1) Init SoundManager + unlock audio on first user gesture
  useEffect(() => {
    sound.init();
    const unlock = () => sound.unlock();
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  // 2) Subscribe to fxBus (heal/poison emitted from action panels)
  useEffect(() => {
    return fxBus.on((name) => {
      setFlashKind(name);
      setFlashKey((k) => k + 1);
    });
  }, []);

  // 3) Phase transitions → ambient sounds
  useEffect(() => {
    const phase = gameState?.phase ?? null;
    const prev = prevPhaseRef.current;
    if (phase === prev) return;
    prevPhaseRef.current = phase;
    if (!phase || prev === null) return; // skip initial mount

    // Ván mới bắt đầu (ended → đêm/ngày): server reset log + vote nên client cũng reset trackers.
    if (prev === 'ended' && phase !== 'ended' && phase !== 'lobby') {
      lastLogIdRef.current = null;
      initLogRef.current = false;
      lastVoteCountRef.current = 0;
      lastSeerKeyRef.current = null;
    }

    const wasNight = prev.startsWith('night_');
    const isNight = phase.startsWith('night_');

    if (!wasNight && isNight) {
      sound.play('wolf_howl');
    }
    if (phase === 'day_reveal') {
      sound.play('rooster');
      sound.play('birds_morning', { delay: 900, volume: 0.7 });
    }
    if (phase === 'night_wolves') {
      sound.play('phase_bell', { volume: 0.5 });
    }
  }, [gameState?.phase]);

  // 4) New log entries → death scream + win fanfare
  useEffect(() => {
    const log = gameState?.log;
    if (!log) return;
    if (log.length === 0) {
      lastLogIdRef.current = null;
      initLogRef.current = false;
      return;
    }

    if (!initLogRef.current) {
      // First time we see this room — skip everything that already happened.
      initLogRef.current = true;
      lastLogIdRef.current = log[log.length - 1]!.id;
      return;
    }

    const lastId = lastLogIdRef.current;
    const startIdx = lastId
      ? log.findIndex((e) => e.id === lastId) + 1
      : 0;

    for (let i = Math.max(0, startIdx); i < log.length; i++) {
      const entry = log[i]!;
      if (entry.kind === 'death') {
        sound.play('death_scream');
        setDeathKey((k) => k + 1);
      } else if (entry.kind === 'win') {
        if (gameState?.winner === 'wolves') sound.play('victory_wolves');
        else sound.play('victory_village');
      }
    }
    lastLogIdRef.current = log[log.length - 1]!.id;
  }, [gameState?.log, gameState?.winner]);

  // 5) Seer result → magic chime + sparkle
  useEffect(() => {
    if (lastNightResult?.type === 'seer_result') {
      const key = `${lastNightResult.targetId}-${lastNightResult.targetRole}`;
      if (lastSeerKeyRef.current !== key) {
        lastSeerKeyRef.current = key;
        sound.play('magic_chime');
        setSparkleKey((k) => k + 1);
      }
    } else {
      lastSeerKeyRef.current = null;
    }
  }, [lastNightResult]);

  // 6) Vote count increases → gavel (any decision: target hoặc skip)
  useEffect(() => {
    const votes = gameState?.vote?.votes;
    if (!votes) {
      lastVoteCountRef.current = 0;
      return;
    }
    const count = Object.keys(votes).length;
    if (count > lastVoteCountRef.current) {
      sound.play('gavel', { volume: 0.55 });
    }
    lastVoteCountRef.current = count;
  }, [gameState?.vote]);

  // 7) day_main countdown ≤5s tick + final
  useEffect(() => {
    const phase = gameState?.phase;
    const endsAt = gameState?.phaseEndsAt;
    if (phase !== 'day_main' || !endsAt) {
      lastTickedSecRef.current = null;
      return;
    }
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (remaining > 5) return;
      if (lastTickedSecRef.current === remaining) return;
      lastTickedSecRef.current = remaining;
      if (remaining >= 2) sound.play('countdown_tick', { volume: 0.65 });
      else if (remaining === 1) sound.play('countdown_final', { volume: 0.75 });
      // remaining === 0: phase will flip imminently; final already played at 1
    }, 200);
    return () => {
      clearInterval(id);
      lastTickedSecRef.current = null;
    };
  }, [gameState?.phase, gameState?.phaseEndsAt]);

  const ended = gameState?.phase === 'ended';
  const winner = gameState?.winner;

  return (
    <>
      <DeathFlash triggerKey={deathKey} />
      <SparkleBurst triggerKey={sparkleKey} />
      <ColorFlash kind={flashKind} triggerKey={flashKey} />
      {ended && winner === 'village' && <Confetti />}
      {ended && winner === 'wolves' && <WolvesParade />}
    </>
  );
}
