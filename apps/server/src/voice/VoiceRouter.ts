import type { GamePhase } from '@ma-soi/shared';
import type { InternalPlayer } from '../engine/types.js';
import { muteAllTracks, updateParticipantGrants } from './livekitClient.js';

export interface VoiceGrant {
  canPublish: boolean;
  canSubscribe: boolean;
}

export function computeGrant(player: InternalPlayer, phase: GamePhase): VoiceGrant {
  if (!player.alive) {
    return { canPublish: false, canSubscribe: true };
  }
  switch (phase) {
    case 'lobby':
    case 'day_reveal':
    case 'day_main':
    case 'ended':
      return { canPublish: true, canSubscribe: true };
    case 'night_wolves':
      if (player.role === 'werewolf') {
        return { canPublish: true, canSubscribe: true };
      }
      return { canPublish: false, canSubscribe: false };
    case 'night_guard':
    case 'night_seer':
    case 'night_witch':
      return { canPublish: false, canSubscribe: false };
    default:
      return { canPublish: false, canSubscribe: false };
  }
}

export async function applyGrants(
  roomName: string,
  phase: GamePhase,
  players: InternalPlayer[],
  log: (msg: string) => void = () => {},
): Promise<void> {
  const tasks = players.map(async (p) => {
    const grant = computeGrant(p, phase);
    try {
      await updateParticipantGrants({
        roomName,
        identity: p.id,
        canPublish: grant.canPublish,
        canSubscribe: grant.canSubscribe,
      });
      if (!grant.canPublish) {
        await muteAllTracks(roomName, p.id).catch(() => {});
      }
    } catch (err) {
      log(`voice grant fail for ${p.nickname}: ${err instanceof Error ? err.message : err}`);
    }
  });
  await Promise.all(tasks);
}
