'use client';

import { useState } from 'react';
import type {
  GamePlayerPublic,
  GameStatePublic,
  MyGameInfo,
  NightActionRequest,
  NightActionResult,
  RoleId,
} from '@ma-soi/shared';
import type { GameSocket } from '@/lib/socket';

interface Props {
  socket: GameSocket | null;
  state: GameStatePublic;
  myInfo: MyGameInfo;
  myPlayerId: string;
  lastResult: NightActionResult | null;
}

export default function NightActionPanel({ socket, state, myInfo, myPlayerId, lastResult }: Props) {
  const me = state.players.find((p) => p.id === myPlayerId);
  if (!me || !me.alive) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-sm text-neutral-400">
        💀 Bạn đã chết. Quan sát cho đến hết ván.
      </div>
    );
  }

  const isMyPhase = phaseMatchesRole(state.phase, myInfo.role);
  if (!isMyPhase) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-sm text-neutral-400">
        ⏳ Chờ pha của bạn…
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <ActionForm socket={socket} state={state} myInfo={myInfo} myPlayerId={myPlayerId} lastResult={lastResult} />
    </div>
  );
}

function phaseMatchesRole(phase: GameStatePublic['phase'], role: RoleId): boolean {
  return (
    (phase === 'night_guard' && role === 'guard') ||
    (phase === 'night_wolves' && role === 'werewolf') ||
    (phase === 'night_seer' && role === 'seer') ||
    (phase === 'night_witch' && role === 'witch')
  );
}

function ActionForm({ socket, state, myInfo, myPlayerId, lastResult }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  function emitAction(action: NightActionRequest) {
    if (!socket) return;
    setBusy(true);
    setError(null);
    socket.emit('game:night_action', action, (res) => {
      setBusy(false);
      if (!res.ok) setError(res.error);
    });
  }

  const aliveOthers = state.players.filter((p) => p.alive && p.id !== myPlayerId);
  const aliveAll = state.players.filter((p) => p.alive);

  if (myInfo.role === 'guard') {
    return (
      <ActionTargets
        title="🛡️ Chọn người để bảo vệ đêm nay"
        targets={aliveAll}
        selected={selected}
        onSelect={setSelected}
        confirmLabel="Bảo vệ"
        onConfirm={() => selected && emitAction({ type: 'guard_protect', targetId: selected })}
        busy={busy}
        error={error}
      />
    );
  }

  if (myInfo.role === 'werewolf') {
    const pendingTarget =
      lastResult?.type === 'wolf_ack' ? lastResult.pendingKillTargetId : null;
    return (
      <ActionTargets
        title="🐺 Chọn người để cắn đêm nay"
        subtitle={
          pendingTarget
            ? `Mục tiêu hiện tại của bầy: ${state.players.find((p) => p.id === pendingTarget)?.nickname ?? '?'}`
            : 'Cả bầy phải đồng ý cùng 1 mục tiêu'
        }
        targets={aliveOthers}
        selected={selected}
        onSelect={setSelected}
        confirmLabel="Cắn"
        onConfirm={() => selected && emitAction({ type: 'wolf_kill', targetId: selected })}
        busy={busy}
        error={error}
      />
    );
  }

  if (myInfo.role === 'seer') {
    if (lastResult?.type === 'seer_result') {
      const target = state.players.find((p) => p.id === lastResult.targetId);
      return (
        <div>
          <div className="text-sm font-semibold">🔮 Kết quả soi:</div>
          <div className="mt-2 rounded-md bg-sky-500/10 p-3 text-sm">
            <span className="font-semibold">{target?.nickname ?? '?'}</span> là{' '}
            <span className={lastResult.targetRole === 'werewolf' ? 'font-bold text-rose-400' : 'text-emerald-300'}>
              {lastResult.targetRole === 'werewolf' ? '🐺 SÓI' : 'người làng'}
            </span>
          </div>
        </div>
      );
    }
    return (
      <ActionTargets
        title="🔮 Chọn người để soi vai"
        targets={aliveOthers}
        selected={selected}
        onSelect={setSelected}
        confirmLabel="Soi"
        onConfirm={() => selected && emitAction({ type: 'seer_check', targetId: selected })}
        busy={busy}
        error={error}
      />
    );
  }

  if (myInfo.role === 'witch') {
    if (lastResult?.type !== 'witch_view') {
      return <div className="text-sm text-neutral-400">⏳ Đang chờ kết quả từ phù thủy…</div>;
    }
    const killed = lastResult.killedTargetId
      ? state.players.find((p) => p.id === lastResult.killedTargetId)
      : null;
    return (
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold">🧪 Phù thủy thức dậy</div>
          <div className="mt-1 text-sm text-neutral-300">
            {killed
              ? <>Đêm nay sói cắn <span className="font-semibold text-rose-300">{killed.nickname}</span></>
              : <>Đêm nay không ai bị sói cắn</>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {killed && lastResult.canHeal && (
            <button
              type="button"
              disabled={busy}
              onClick={() => emitAction({ type: 'witch_heal' })}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-emerald-500 transition"
            >
              🧪 Cứu {killed.nickname}
            </button>
          )}

          {lastResult.canPoison && (
            <PoisonPicker
              targets={aliveOthers}
              busy={busy}
              onConfirm={(targetId) => emitAction({ type: 'witch_poison', targetId })}
            />
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => emitAction({ type: 'witch_pass' })}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 disabled:opacity-40 hover:bg-neutral-800 transition"
          >
            Bỏ qua đêm nay
          </button>
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    );
  }

  return null;
}

function ActionTargets({
  title,
  subtitle,
  targets,
  selected,
  onSelect,
  confirmLabel,
  onConfirm,
  busy,
  error,
}: {
  title: string;
  subtitle?: string;
  targets: GamePlayerPublic[];
  selected: string | null;
  onSelect: (id: string) => void;
  confirmLabel: string;
  onConfirm: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {subtitle && <div className="mt-1 text-xs text-neutral-400">{subtitle}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {targets.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`rounded-md border px-3 py-2 text-sm transition ${
              selected === t.id
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200'
                : 'border-neutral-700 bg-neutral-950 hover:border-neutral-600'
            }`}
          >
            {t.nickname}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onConfirm}
        disabled={!selected || busy}
        className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-emerald-500 transition"
      >
        {confirmLabel}
      </button>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}

function PoisonPicker({
  targets,
  busy,
  onConfirm,
}: {
  targets: GamePlayerPublic[];
  busy: boolean;
  onConfirm: (targetId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-600 transition"
      >
        ☠️ Đầu độc người khác
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-rose-700/40 bg-rose-700/5 p-3">
      <div className="text-xs text-rose-200">Chọn người để đầu độc:</div>
      <div className="grid grid-cols-2 gap-2">
        {targets.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTarget(t.id)}
            className={`rounded border px-2 py-1 text-xs ${
              target === t.id ? 'border-rose-400 bg-rose-500/20' : 'border-neutral-700 hover:border-neutral-500'
            }`}
          >
            {t.nickname}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => target && onConfirm(target)}
          disabled={!target || busy}
          className="flex-1 rounded bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 hover:bg-rose-500 transition"
        >
          Đầu độc
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTarget(null);
          }}
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition"
        >
          Hủy
        </button>
      </div>
    </div>
  );
}
