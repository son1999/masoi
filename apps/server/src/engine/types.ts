import type { RoleId } from '@ma-soi/shared';

export interface InternalPlayer {
  id: string;
  nickname: string;
  role: RoleId;
  alive: boolean;
}

export interface WitchPotions {
  heal: boolean;
  poison: boolean;
}

export interface NightState {
  guardProtectedId: string | null;
  guardLastNightProtectedId: string | null;
  wolfKillTargetId: string | null;
  // null = sói đó chọn bỏ qua (không cắn ai)
  wolfVotes: Record<string, string | null>;
  seerCheckedId: string | null;
  witchHealUsed: boolean;
  witchPoisonTargetId: string | null;
  witchActed: boolean;
}

export function freshNightState(prev: NightState | null): NightState {
  return {
    guardProtectedId: null,
    guardLastNightProtectedId: prev?.guardProtectedId ?? null,
    wolfKillTargetId: null,
    wolfVotes: {},
    seerCheckedId: null,
    witchHealUsed: false,
    witchPoisonTargetId: null,
    witchActed: false,
  };
}
