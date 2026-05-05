import { randomUUID } from 'node:crypto';
import {
  computeRoleDistribution,
  MIN_PLAYERS_TO_START,
  PHASE_DURATIONS_MS,
  roleTeam,
  type GamePhase,
  type GamePlayerPublic,
  type GameStatePublic,
  type MyGameInfo,
  type NightActionRequest,
  type NightActionResult,
  type PublicLogEntry,
  type PublicPlayer,
  type RoleId,
  type RoleTeam,
} from '@ma-soi/shared';
import { freshNightState, type InternalPlayer, type NightState, type WitchPotions } from './types.js';

export interface GameEngineCallbacks {
  onStateChanged: (state: GameStatePublic) => void;
  onMyInfo: (playerId: string, info: MyGameInfo) => void;
  onNightResult: (playerId: string, result: NightActionResult) => void;
  onPhaseChanged: (phase: GamePhase, players: InternalPlayer[]) => void;
  onEnded: (winner: RoleTeam) => void;
}

const NIGHT_PHASE_ORDER: GamePhase[] = ['night_guard', 'night_wolves', 'night_seer', 'night_witch'];

export class GameEngine {
  private players: InternalPlayer[];
  private phase: GamePhase = 'lobby';
  private night = 0;
  private phaseEndsAt: number | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private log: PublicLogEntry[] = [];
  private votes: Record<string, string | null> = {};
  private night_state: NightState = freshNightState(null);
  private witchPotions: WitchPotions = { heal: true, poison: true };
  private ended = false;
  private winner: RoleTeam | null = null;

  constructor(roomPlayers: PublicPlayer[], private cb: GameEngineCallbacks) {
    this.players = assignRoles(roomPlayers);
  }

  start() {
    if (this.players.length < MIN_PLAYERS_TO_START) {
      throw new Error(`Cần tối thiểu ${MIN_PLAYERS_TO_START} người chơi`);
    }
    this.appendLog('phase', 'Trò chơi bắt đầu — đêm đầu tiên buông xuống');
    for (const p of this.players) {
      this.cb.onMyInfo(p.id, this.buildMyInfo(p));
    }
    this.advanceToNextNightPhase();
  }

  submitNightAction(actorId: string, action: NightActionRequest): { ok: true } | { ok: false; error: string } {
    const actor = this.players.find((p) => p.id === actorId);
    if (!actor || !actor.alive) return { ok: false, error: 'Bạn không sống / không trong ván' };

    switch (action.type) {
      case 'guard_protect':
        if (this.phase !== 'night_guard') return { ok: false, error: 'Không phải pha bảo vệ' };
        if (actor.role !== 'guard') return { ok: false, error: 'Bạn không phải Bảo vệ' };
        if (action.targetId === this.night_state.guardLastNightProtectedId) {
          return { ok: false, error: 'Không bảo vệ cùng người 2 đêm liên tiếp' };
        }
        if (!this.isAliveTarget(action.targetId)) return { ok: false, error: 'Mục tiêu không hợp lệ' };
        this.night_state.guardProtectedId = action.targetId;
        this.cb.onNightResult(actor.id, { type: 'guard_ack' });
        this.tryAdvancePhase();
        return { ok: true };

      case 'wolf_kill':
        if (this.phase !== 'night_wolves') return { ok: false, error: 'Không phải pha sói' };
        if (actor.role !== 'werewolf') return { ok: false, error: 'Bạn không phải Sói' };
        if (!this.isAliveTarget(action.targetId)) return { ok: false, error: 'Mục tiêu không hợp lệ' };
        this.night_state.wolfVotes[actor.id] = action.targetId;
        this.recomputeWolfTarget();
        for (const w of this.aliveWolves()) {
          this.cb.onNightResult(w.id, {
            type: 'wolf_ack',
            pendingKillTargetId: this.night_state.wolfKillTargetId,
          });
        }
        if (this.allWolvesVotedSame()) this.tryAdvancePhase();
        return { ok: true };

      case 'seer_check': {
        if (this.phase !== 'night_seer') return { ok: false, error: 'Không phải pha tiên tri' };
        if (actor.role !== 'seer') return { ok: false, error: 'Bạn không phải Tiên tri' };
        const target = this.players.find((p) => p.id === action.targetId);
        if (!target || !target.alive || target.id === actor.id) {
          return { ok: false, error: 'Mục tiêu không hợp lệ' };
        }
        this.night_state.seerCheckedId = target.id;
        this.cb.onNightResult(actor.id, {
          type: 'seer_result',
          targetId: target.id,
          targetRole: target.role,
        });
        this.tryAdvancePhase();
        return { ok: true };
      }

      case 'witch_heal':
        if (this.phase !== 'night_witch') return { ok: false, error: 'Không phải pha phù thủy' };
        if (actor.role !== 'witch') return { ok: false, error: 'Bạn không phải Phù thủy' };
        if (!this.witchPotions.heal) return { ok: false, error: 'Bình cứu đã dùng' };
        if (!this.night_state.wolfKillTargetId) return { ok: false, error: 'Đêm nay không ai bị cắn' };
        this.night_state.witchHealUsed = true;
        this.witchPotions.heal = false;
        this.night_state.witchActed = true;
        this.cb.onNightResult(actor.id, { type: 'no_op' });
        this.tryAdvancePhase();
        return { ok: true };

      case 'witch_poison':
        if (this.phase !== 'night_witch') return { ok: false, error: 'Không phải pha phù thủy' };
        if (actor.role !== 'witch') return { ok: false, error: 'Bạn không phải Phù thủy' };
        if (!this.witchPotions.poison) return { ok: false, error: 'Bình độc đã dùng' };
        if (!this.isAliveTarget(action.targetId)) return { ok: false, error: 'Mục tiêu không hợp lệ' };
        this.night_state.witchPoisonTargetId = action.targetId;
        this.witchPotions.poison = false;
        this.night_state.witchActed = true;
        this.cb.onNightResult(actor.id, { type: 'no_op' });
        this.tryAdvancePhase();
        return { ok: true };

      case 'witch_pass':
        if (this.phase !== 'night_witch') return { ok: false, error: 'Không phải pha phù thủy' };
        if (actor.role !== 'witch') return { ok: false, error: 'Bạn không phải Phù thủy' };
        this.night_state.witchActed = true;
        this.cb.onNightResult(actor.id, { type: 'no_op' });
        this.tryAdvancePhase();
        return { ok: true };
    }
  }

  submitVote(voterId: string, targetId: string | null): { ok: true } | { ok: false; error: string } {
    if (this.phase !== 'day_main') return { ok: false, error: 'Không phải pha bỏ phiếu' };
    const voter = this.players.find((p) => p.id === voterId);
    if (!voter || !voter.alive) return { ok: false, error: 'Bạn không sống' };
    if (targetId !== null && !this.isAliveTarget(targetId)) return { ok: false, error: 'Mục tiêu không hợp lệ' };
    this.votes[voterId] = targetId;
    this.publishState();
    this.tryAutoSkipDayVote();
    return { ok: true };
  }

  // Vote semantics:
  //   missing key  → chưa quyết định
  //   value null   → đồng ý bỏ qua (skip)
  //   value string → vote treo cổ targetId
  // Khi 100% người sống đều skip → cắt pha ngay, không treo ai.
  private tryAutoSkipDayVote() {
    if (this.phase !== 'day_main') return;
    const alive = this.players.filter((p) => p.alive);
    if (alive.length === 0) return;
    const allSkipped = alive.every((p) => p.id in this.votes && this.votes[p.id] === null);
    if (!allSkipped) return;
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    this.resolveDayVoteAndAdvanceToNight();
  }

  destroy() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
  }

  // Gọi khi 1 player thực sự rời phòng giữa ván (Rời phòng + đóng hết tab).
  // Đánh dấu chết, gỡ vote/action đang treo, kiểm tra lại winner / advance phase.
  handlePlayerLeft(playerId: string) {
    if (this.ended || this.phase === 'lobby') return;
    const player = this.players.find((p) => p.id === playerId);
    if (!player || !player.alive) return;

    player.alive = false;
    this.appendLog('death', `${player.nickname} đã rời phòng`);

    delete this.votes[playerId];
    delete this.night_state.wolfVotes[playerId];
    this.recomputeWolfTarget();

    const winner = this.checkWinner();
    if (winner) {
      this.endGame(winner);
      return;
    }

    this.publishState();

    if (this.phase === 'day_main') {
      this.tryAutoSkipDayVote();
    } else if (this.phase.startsWith('night_')) {
      this.tryAdvancePhase();
    }
  }

  // ===== Internal phase machine =====

  private advanceToNextNightPhase() {
    const idx = NIGHT_PHASE_ORDER.indexOf(this.phase);
    let next: GamePhase | null = null;
    for (let i = idx + 1; i < NIGHT_PHASE_ORDER.length; i++) {
      const candidate = NIGHT_PHASE_ORDER[i]!;
      if (this.phaseHasActor(candidate)) {
        next = candidate;
        break;
      }
    }
    if (this.phase === 'lobby') {
      this.night = 1;
      for (const cand of NIGHT_PHASE_ORDER) {
        if (this.phaseHasActor(cand)) {
          next = cand;
          break;
        }
      }
    }
    if (next) {
      this.enterPhase(next);
    } else {
      this.resolveNightAndAdvanceToDay();
    }
  }

  private enterPhase(phase: GamePhase) {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phase = phase;

    const dur = PHASE_DURATIONS_MS[phase as keyof typeof PHASE_DURATIONS_MS];
    if (dur) {
      this.phaseEndsAt = Date.now() + dur;
      this.phaseTimer = setTimeout(() => this.onPhaseTimeout(), dur);
    } else {
      this.phaseEndsAt = null;
    }

    this.appendLog('phase', this.phaseLabel(phase));

    if (phase === 'night_witch') {
      const witch = this.players.find((p) => p.role === 'witch' && p.alive);
      if (witch) {
        this.cb.onNightResult(witch.id, {
          type: 'witch_view',
          killedTargetId: this.night_state.wolfKillTargetId,
          canHeal: this.witchPotions.heal,
          canPoison: this.witchPotions.poison,
        });
      }
    }

    if (phase === 'day_main') {
      this.votes = {};
    }

    this.cb.onPhaseChanged(phase, this.players);
    this.publishState();
  }

  private onPhaseTimeout() {
    this.phaseTimer = null;
    if (this.phase.startsWith('night_')) {
      this.advanceToNextNightPhase();
    } else if (this.phase === 'day_reveal') {
      this.enterPhase('day_main');
    } else if (this.phase === 'day_main') {
      this.resolveDayVoteAndAdvanceToNight();
    }
  }

  private tryAdvancePhase() {
    // Pha hiện tại không còn actor sống (vd actor đã rời/chết) → bỏ qua luôn.
    if (this.phase.startsWith('night_') && !this.phaseHasActor(this.phase)) {
      this.advanceToNextNightPhase();
      return;
    }
    if (this.phase === 'night_guard' && this.night_state.guardProtectedId) {
      this.advanceToNextNightPhase();
    } else if (this.phase === 'night_wolves' && this.allWolvesVotedSame()) {
      this.advanceToNextNightPhase();
    } else if (this.phase === 'night_seer' && this.night_state.seerCheckedId) {
      this.advanceToNextNightPhase();
    } else if (this.phase === 'night_witch' && this.night_state.witchActed) {
      this.advanceToNextNightPhase();
    }
  }

  private resolveNightAndAdvanceToDay() {
    const deaths = this.computeNightDeaths();
    for (const id of deaths) {
      const p = this.players.find((x) => x.id === id);
      if (p) {
        p.alive = false;
        this.appendLog('death', `${p.nickname} đã chết trong đêm`);
      }
    }
    if (deaths.length === 0) {
      this.appendLog('phase', 'Đêm yên bình — không ai chết');
    }

    const winner = this.checkWinner();
    if (winner) {
      this.endGame(winner);
      return;
    }
    this.enterPhase('day_reveal');
  }

  private resolveDayVoteAndAdvanceToNight() {
    const tally: Record<string, number> = {};
    for (const target of Object.values(this.votes)) {
      if (target) tally[target] = (tally[target] ?? 0) + 1;
    }
    let topId: string | null = null;
    let topCount = 0;
    let tied = false;
    for (const [id, count] of Object.entries(tally)) {
      if (count > topCount) {
        topCount = count;
        topId = id;
        tied = false;
      } else if (count === topCount) {
        tied = true;
      }
    }
    if (topId && !tied) {
      const p = this.players.find((x) => x.id === topId);
      if (p && p.alive) {
        p.alive = false;
        this.appendLog('vote', `${p.nickname} đã bị treo cổ (${topCount} phiếu)`);
      }
    } else {
      const alive = this.players.filter((p) => p.alive);
      const allSkipped =
        alive.length > 0 && alive.every((p) => p.id in this.votes && this.votes[p.id] === null);
      this.appendLog(
        'vote',
        allSkipped
          ? 'Tất cả đồng ý bỏ qua — không treo cổ ai'
          : 'Không treo cổ ai (hòa phiếu hoặc không bỏ phiếu)',
      );
    }

    const winner = this.checkWinner();
    if (winner) {
      this.endGame(winner);
      return;
    }

    this.night += 1;
    this.night_state = freshNightState(this.night_state);
    let nextPhase: GamePhase | null = null;
    for (const cand of NIGHT_PHASE_ORDER) {
      if (this.phaseHasActor(cand)) {
        nextPhase = cand;
        break;
      }
    }
    if (nextPhase) this.enterPhase(nextPhase);
    else this.resolveNightAndAdvanceToDay();
  }

  private computeNightDeaths(): string[] {
    const deaths = new Set<string>();
    const wolfTarget = this.night_state.wolfKillTargetId;
    if (wolfTarget && wolfTarget !== this.night_state.guardProtectedId && !this.night_state.witchHealUsed) {
      deaths.add(wolfTarget);
    }
    if (this.night_state.witchPoisonTargetId) {
      deaths.add(this.night_state.witchPoisonTargetId);
    }
    return Array.from(deaths);
  }

  private checkWinner(): RoleTeam | null {
    const aliveWolves = this.players.filter((p) => p.alive && p.role === 'werewolf').length;
    const aliveVillagers = this.players.filter((p) => p.alive && p.role !== 'werewolf').length;
    if (aliveWolves === 0) return 'village';
    if (aliveWolves >= aliveVillagers) return 'wolves';
    return null;
  }

  private endGame(winner: RoleTeam) {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    this.phase = 'ended';
    this.phaseEndsAt = null;
    this.ended = true;
    this.winner = winner;
    this.appendLog('win', winner === 'wolves' ? 'Phe SÓI thắng' : 'Phe DÂN LÀNG thắng');
    this.cb.onPhaseChanged('ended', this.players);
    this.publishState();
    this.cb.onEnded(winner);
  }

  // ===== Helpers =====

  private isAliveTarget(id: string): boolean {
    return this.players.some((p) => p.id === id && p.alive);
  }

  private aliveWolves(): InternalPlayer[] {
    return this.players.filter((p) => p.role === 'werewolf' && p.alive);
  }

  private allWolvesVotedSame(): boolean {
    const wolves = this.aliveWolves();
    if (wolves.length === 0) return false;
    const targets = wolves.map((w) => this.night_state.wolfVotes[w.id]).filter(Boolean) as string[];
    if (targets.length !== wolves.length) return false;
    return targets.every((t) => t === targets[0]);
  }

  private recomputeWolfTarget() {
    const tally: Record<string, number> = {};
    for (const t of Object.values(this.night_state.wolfVotes)) {
      tally[t] = (tally[t] ?? 0) + 1;
    }
    let topId: string | null = null;
    let topCount = 0;
    for (const [id, count] of Object.entries(tally)) {
      if (count > topCount) {
        topCount = count;
        topId = id;
      }
    }
    this.night_state.wolfKillTargetId = topId;
  }

  private phaseHasActor(phase: GamePhase): boolean {
    switch (phase) {
      case 'night_guard':
        return this.players.some((p) => p.role === 'guard' && p.alive);
      case 'night_wolves':
        return this.aliveWolves().length > 0;
      case 'night_seer':
        return this.players.some((p) => p.role === 'seer' && p.alive);
      case 'night_witch': {
        const witch = this.players.find((p) => p.role === 'witch' && p.alive);
        if (!witch) return false;
        return this.witchPotions.heal || this.witchPotions.poison;
      }
      default:
        return false;
    }
  }

  private buildMyInfo(p: InternalPlayer): MyGameInfo {
    const info: MyGameInfo = {
      role: p.role,
      team: roleTeam(p.role),
    };
    if (p.role === 'werewolf') {
      info.fellowWolves = this.players.filter((x) => x.role === 'werewolf').map((x) => x.id);
    }
    if (p.role === 'witch') {
      info.witchPotions = { ...this.witchPotions };
    }
    return info;
  }

  private appendLog(kind: PublicLogEntry['kind'], text: string) {
    this.log.push({ id: randomUUID(), ts: Date.now(), kind, text });
    if (this.log.length > 200) this.log = this.log.slice(-200);
  }

  private phaseLabel(phase: GamePhase): string {
    switch (phase) {
      case 'night_guard':
        return `Đêm ${this.night}: Bảo vệ thức dậy`;
      case 'night_wolves':
        return `Đêm ${this.night}: Sói thức dậy`;
      case 'night_seer':
        return `Đêm ${this.night}: Tiên tri thức dậy`;
      case 'night_witch':
        return `Đêm ${this.night}: Phù thủy thức dậy`;
      case 'day_reveal':
        return `Ngày ${this.night}: Mặt trời lên`;
      case 'day_main':
        return `Ngày ${this.night}: Thảo luận và treo cổ (3 phút)`;
      case 'ended':
        return 'Trò chơi kết thúc';
      default:
        return phase;
    }
  }

  // ===== State exposure =====

  buildPublicState(): GameStatePublic {
    const reveal = this.phase === 'ended';
    const players: GamePlayerPublic[] = this.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      alive: p.alive,
      ...(reveal ? { revealedRole: p.role } : {}),
    }));
    return {
      phase: this.phase,
      night: this.night,
      phaseEndsAt: this.phaseEndsAt,
      players,
      log: this.log,
      vote: this.phase === 'day_main' ? { votes: { ...this.votes } } : undefined,
      winner: this.winner ?? undefined,
    };
  }

  getInternalPlayers(): InternalPlayer[] {
    return [...this.players];
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  isEnded(): boolean {
    return this.ended;
  }

  private publishState() {
    this.cb.onStateChanged(this.buildPublicState());
  }
}

function assignRoles(roomPlayers: PublicPlayer[]): InternalPlayer[] {
  const dist = computeRoleDistribution(roomPlayers.length);
  const pool: RoleId[] = [];
  for (let i = 0; i < dist.werewolf; i++) pool.push('werewolf');
  for (let i = 0; i < dist.seer; i++) pool.push('seer');
  for (let i = 0; i < dist.witch; i++) pool.push('witch');
  for (let i = 0; i < dist.guard; i++) pool.push('guard');
  for (let i = 0; i < dist.villager; i++) pool.push('villager');

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }

  return roomPlayers.map((p, idx) => ({
    id: p.id,
    nickname: p.nickname,
    role: pool[idx]!,
    alive: true,
  }));
}
