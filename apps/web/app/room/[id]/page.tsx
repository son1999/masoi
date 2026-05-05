'use client';

import { use, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { loadSession } from '@/lib/auth';
import { getSocket, type GameSocket } from '@/lib/socket';
import VoicePanel from '@/components/VoicePanel';
import RoleCard from '@/components/RoleCard';
import PhaseHeader from '@/components/PhaseHeader';
import NightActionPanel from '@/components/NightActionPanel';
import VotePanel from '@/components/VotePanel';
import GameLog from '@/components/GameLog';
import PhaseBackdrop from '@/components/PhaseBackdrop';
import EffectsLayer from '@/components/EffectsLayer';
import SoundToggle from '@/components/SoundToggle';
import type {
  ChatMessage,
  GameStatePublic,
  MyGameInfo,
  NightActionResult,
  RoleId,
  RoomState,
} from '@ma-soi/shared';
import { MIN_PLAYERS_TO_START } from '@ma-soi/shared';

interface PageProps {
  params: Promise<{ id: string }>;
}

const ROLE_VN: Record<RoleId, string> = {
  villager: 'Dân làng',
  werewolf: 'Sói',
  seer: 'Tiên tri',
  witch: 'Phù thủy',
  guard: 'Bảo vệ',
};

export default function RoomPage({ params }: PageProps) {
  const { id: roomId } = use(params);
  const router = useRouter();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [gameState, setGameState] = useState<GameStatePublic | null>(null);
  const [myInfo, setMyInfo] = useState<MyGameInfo | null>(null);
  const [lastNightResult, setLastNightResult] = useState<NightActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const socketRef = useRef<GameSocket | null>(null);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      router.replace('/');
      return;
    }
    setMyPlayerId(session.playerId);

    const socket = getSocket(session.token);
    socketRef.current = socket;

    const onState = (next: RoomState) => setRoom(next);
    const onPlayerJoined = (player: RoomState['players'][number]) =>
      setRoom((prev) => (prev ? { ...prev, players: [...prev.players.filter((p) => p.id !== player.id), player] } : prev));
    const onPlayerLeft = (playerId: string) =>
      setRoom((prev) => (prev ? { ...prev, players: prev.players.filter((p) => p.id !== playerId) } : prev));
    const onOnlineChanged = (playerId: string, isOnline: boolean) =>
      setRoom((prev) =>
        prev
          ? { ...prev, players: prev.players.map((p) => (p.id === playerId ? { ...p, isOnline } : p)) }
          : prev,
      );
    const onChat = (msg: ChatMessage) =>
      setRoom((prev) => (prev ? { ...prev, chat: [...prev.chat, msg] } : prev));
    const onConnectError = (err: Error) => setError(err.message);

    const onGameState = (next: GameStatePublic) => {
      setGameState(next);
      if (next.phase !== 'night_seer' && next.phase !== 'night_witch' && next.phase !== 'night_wolves') {
        // clear stale night result when moving past night
        if (next.phase === 'day_reveal' || next.phase === 'day_main' || next.phase === 'lobby' || next.phase === 'ended') {
          setLastNightResult(null);
        }
      }
    };
    const onMyInfo = (info: MyGameInfo) => setMyInfo(info);
    const onNightResult = (result: NightActionResult) => setLastNightResult(result);

    socket.on('room:state', onState);
    socket.on('room:player_joined', onPlayerJoined);
    socket.on('room:player_left', onPlayerLeft);
    socket.on('room:player_online_changed', onOnlineChanged);
    socket.on('chat:message', onChat);
    socket.on('connect_error', onConnectError);
    socket.on('game:state', onGameState);
    socket.on('game:my_info', onMyInfo);
    socket.on('game:night_result', onNightResult);

    function fetchRoom() {
      socket.emit('room:get', { roomId }, (res) => {
        if (!res.ok) {
          setError(res.error);
          setTimeout(() => router.replace('/'), 1500);
          return;
        }
        setRoom(res.data);
      });
    }

    if (socket.connected) fetchRoom();
    else socket.once('connect', fetchRoom);

    return () => {
      socket.off('room:state', onState);
      socket.off('room:player_joined', onPlayerJoined);
      socket.off('room:player_left', onPlayerLeft);
      socket.off('room:player_online_changed', onOnlineChanged);
      socket.off('chat:message', onChat);
      socket.off('connect_error', onConnectError);
      socket.off('game:state', onGameState);
      socket.off('game:my_info', onMyInfo);
      socket.off('game:night_result', onNightResult);
    };
  }, [roomId, router]);

  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [room?.chat.length]);

  const fellowWolfNames = useMemo(() => {
    if (!myInfo?.fellowWolves || !room) return undefined;
    return myInfo.fellowWolves
      .filter((id) => id !== myPlayerId)
      .map((id) => room.players.find((p) => p.id === id)?.nickname ?? '?');
  }, [myInfo, room, myPlayerId]);

  function copyJoinCode() {
    if (!room) return;
    void navigator.clipboard.writeText(room.joinCode);
  }

  function leave() {
    const socket = socketRef.current;
    if (!socket) return router.push('/');
    socket.emit('room:leave', () => router.push('/'));
  }

  function startGame() {
    const socket = socketRef.current;
    if (!socket) return;
    setBusy(true);
    setError(null);
    socket.emit('game:start', (res) => {
      setBusy(false);
      if (!res.ok) setError(res.error);
    });
  }

  function sendChat(e: FormEvent) {
    e.preventDefault();
    const socket = socketRef.current;
    if (!socket) return;
    const text = chatInput.trim();
    if (!text) return;
    socket.emit('chat:send', { text }, (res) => {
      if (!res.ok) setError(res.error);
      else setChatInput('');
    });
  }

  if (!room) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-sm text-neutral-400">
        <span>Đang tải phòng…</span>
        {error && <p className="text-rose-400">{error}</p>}
      </main>
    );
  }

  const ended = gameState?.phase === 'ended';
  const inGame = !!gameState && gameState.phase !== 'lobby' && !ended;
  const isHost = myPlayerId === room.hostId;
  const canStart = isHost && !inGame && room.players.length >= MIN_PLAYERS_TO_START;
  const showGameStatus = inGame || ended;
  const playersWithGameStatus = showGameStatus && gameState
    ? room.players.map((p) => ({
        ...p,
        gp: gameState.players.find((gp) => gp.id === p.id),
      }))
    : room.players.map((p) => ({ ...p, gp: undefined }));

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 md:p-6">
      <PhaseBackdrop phase={gameState?.phase ?? null} />
      <EffectsLayer gameState={gameState} lastNightResult={lastNightResult} />
      <header className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">
            {inGame ? '🎮 Đang chơi' : ended ? '🏁 Ván đã kết thúc' : 'Phòng chờ'}
          </h1>
          {!inGame && !ended && (
            <button
              type="button"
              onClick={copyJoinCode}
              className="mt-1 rounded bg-neutral-800 px-2 py-1 font-mono text-sm tracking-widest text-emerald-300 hover:bg-neutral-700 transition"
              title="Bấm để copy mã mời"
            >
              {room.joinCode}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SoundToggle />
          {canStart && (
            <button
              type="button"
              onClick={startGame}
              disabled={busy}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-emerald-500 transition"
            >
              {ended ? '🔄 Bắt đầu ván mới' : '▶ Bắt đầu ván'}
            </button>
          )}
          <button
            type="button"
            onClick={leave}
            className="rounded-md border border-rose-500/50 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-500/10 transition"
          >
            Rời phòng
          </button>
        </div>
      </header>

      {inGame && gameState && (
        <PhaseHeader phase={gameState.phase} night={gameState.night} phaseEndsAt={gameState.phaseEndsAt} />
      )}

      {gameState?.phase === 'ended' && gameState.winner && (
        <div
          className={`rounded-lg border-2 p-6 text-center ${
            gameState.winner === 'wolves'
              ? 'border-rose-500/60 bg-rose-500/10'
              : 'border-emerald-500/60 bg-emerald-500/10'
          }`}
        >
          <div className="text-sm text-neutral-300">Trò chơi kết thúc</div>
          <div
            className={`mt-1 text-3xl font-bold ${
              gameState.winner === 'wolves' ? 'text-rose-300' : 'text-emerald-300'
            }`}
          >
            {gameState.winner === 'wolves' ? '🐺 Phe SÓI thắng' : '🧑‍🌾 Phe DÂN LÀNG thắng'}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
            {gameState.players.map((p) => (
              <div key={p.id} className="rounded-md border border-neutral-800 bg-neutral-950/50 px-2 py-1">
                <div className="font-semibold">{p.nickname}</div>
                <div className="text-neutral-400">
                  {p.revealedRole ? ROLE_VN[p.revealedRole] : '?'} {p.alive ? '' : '· đã chết'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid flex-1 gap-4 md:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-neutral-300">
              Người chơi ({room.players.length})
              {!inGame && room.players.length < MIN_PLAYERS_TO_START && (
                <span className="ml-2 text-xs font-normal text-amber-400">
                  cần ≥ {MIN_PLAYERS_TO_START}
                </span>
              )}
            </h2>
            <ul className="space-y-1.5">
              {playersWithGameStatus.map((p) => {
                const dead = inGame && p.gp && !p.gp.alive;
                return (
                  <li
                    key={p.id}
                    className={`flex items-center justify-between rounded-md bg-neutral-950/50 px-3 py-2 text-sm ${
                      dead ? 'opacity-40' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={
                          inGame
                            ? dead
                              ? 'h-2 w-2 rounded-full bg-rose-700'
                              : 'h-2 w-2 rounded-full bg-emerald-500'
                            : p.isOnline
                            ? 'h-2 w-2 rounded-full bg-emerald-500'
                            : 'h-2 w-2 rounded-full bg-neutral-600'
                        }
                      />
                      <span
                        className={
                          (p.id === myPlayerId ? 'font-semibold text-emerald-300 ' : '') +
                          (dead ? 'line-through' : '')
                        }
                      >
                        {p.nickname}
                      </span>
                    </span>
                    {!inGame && p.isHost && <span className="text-xs text-amber-400">👑</span>}
                    {dead && <span className="text-xs text-rose-400">💀</span>}
                  </li>
                );
              })}
            </ul>
          </section>

          {myPlayerId && (
            <VoicePanel
              socket={socketRef.current}
              myPlayerId={myPlayerId}
              isHost={room.hostId === myPlayerId}
              players={room.players}
            />
          )}

          {inGame && myInfo && (
            <RoleCard info={myInfo} fellowWolfNames={fellowWolfNames} />
          )}
        </div>

        <section className="flex flex-col gap-4">
          {inGame && gameState && myInfo && myPlayerId && (
            <>
              {gameState.phase.startsWith('night_') && (
                <NightActionPanel
                  socket={socketRef.current}
                  state={gameState}
                  myInfo={myInfo}
                  myPlayerId={myPlayerId}
                  lastResult={lastNightResult}
                />
              )}
              {gameState.phase === 'day_main' && (
                <VotePanel socket={socketRef.current} state={gameState} myPlayerId={myPlayerId} />
              )}
              <GameLog log={gameState.log} />
            </>
          )}

          <div className="flex flex-1 flex-col rounded-lg border border-neutral-800 bg-neutral-900/50">
            <div ref={chatBoxRef} className="max-h-[40vh] flex-1 space-y-2 overflow-y-auto p-4">
              {room.chat.length === 0 ? (
                <p className="text-center text-xs text-neutral-500">Chưa có tin nhắn nào</p>
              ) : (
                room.chat.map((msg) => <ChatBubble key={msg.id} msg={msg} mine={msg.playerId === myPlayerId} />)
              )}
            </div>
            <form onSubmit={sendChat} className="flex gap-2 border-t border-neutral-800 p-3">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={500}
                placeholder="Nhập tin nhắn…"
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition"
              >
                Gửi
              </button>
            </form>
          </div>
        </section>
      </div>

      {error && (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </main>
  );
}

function ChatBubble({ msg, mine }: { msg: ChatMessage; mine: boolean }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
          mine ? 'bg-emerald-600/20 text-emerald-100' : 'bg-neutral-800 text-neutral-100'
        }`}
      >
        {!mine && <div className="text-xs font-semibold text-neutral-400">{msg.nickname}</div>}
        <div>{msg.text}</div>
      </div>
    </div>
  );
}
