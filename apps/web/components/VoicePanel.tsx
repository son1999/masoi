'use client';

import { useEffect, useRef, useState } from 'react';
import {
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  RoomEvent,
  Track,
} from 'livekit-client';
import { joinVoice, leaveVoice, setLocalMic } from '@/lib/livekit';
import type { GameSocket } from '@/lib/socket';
import type { PublicPlayer } from '@ma-soi/shared';

interface Props {
  socket: GameSocket | null;
  myPlayerId: string;
  isHost: boolean;
  players: PublicPlayer[];
}

interface VoiceParticipant {
  identity: string;
  isSpeaking: boolean;
  isMicEnabled: boolean;
}

type Status = 'idle' | 'connecting' | 'connected' | 'error';

export default function VoicePanel({ socket, myPlayerId, isHost, players }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [canPublish, setCanPublish] = useState(true);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [busy, setBusy] = useState(false);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!socket) return;
    let cancelled = false;
    let detach: (() => void) | null = null;
    let mountedRoom: Awaited<ReturnType<typeof joinVoice>> | null = null;

    const timer = setTimeout(async () => {
      if (cancelled) return;
      setStatus('connecting');
      setError(null);
      try {
        const room = await joinVoice(socket);
        if (cancelled) {
          await room.disconnect();
          return;
        }
        mountedRoom = room;
        setStatus('connected');

        const update = () => {
          const next: VoiceParticipant[] = [];
          for (const p of [room.localParticipant, ...room.remoteParticipants.values()]) {
            const audioPub = p.audioTrackPublications.values().next().value;
            next.push({
              identity: p.identity,
              isSpeaking: p.isSpeaking,
              isMicEnabled: audioPub ? !audioPub.isMuted : false,
            });
          }
          setParticipants(next);
        };
        update();

        const onSub = (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.id = `audio-${participant.identity}`;
            audioContainerRef.current?.appendChild(el);
          }
          update();
        };
        const onUnsub = (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
          update();
        };
        const onPerms = () => {
          const allowed = room.localParticipant.permissions?.canPublish ?? true;
          setCanPublish(allowed);
          if (!allowed && room.localParticipant.isMicrophoneEnabled) {
            void setLocalMic(false);
            setMicEnabled(false);
          }
          update();
        };

        room.on(RoomEvent.TrackSubscribed, onSub);
        room.on(RoomEvent.TrackUnsubscribed, onUnsub);
        room.on(RoomEvent.ActiveSpeakersChanged, update);
        room.on(RoomEvent.ParticipantConnected, update);
        room.on(RoomEvent.ParticipantDisconnected, update);
        room.on(RoomEvent.TrackMuted, update);
        room.on(RoomEvent.TrackUnmuted, update);
        room.on(RoomEvent.LocalTrackPublished, update);
        room.on(RoomEvent.LocalTrackUnpublished, update);
        room.on(RoomEvent.ParticipantPermissionsChanged, onPerms);

        detach = () => {
          room.off(RoomEvent.TrackSubscribed, onSub);
          room.off(RoomEvent.TrackUnsubscribed, onUnsub);
          room.off(RoomEvent.ActiveSpeakersChanged, update);
          room.off(RoomEvent.ParticipantConnected, update);
          room.off(RoomEvent.ParticipantDisconnected, update);
          room.off(RoomEvent.TrackMuted, update);
          room.off(RoomEvent.TrackUnmuted, update);
          room.off(RoomEvent.LocalTrackPublished, update);
          room.off(RoomEvent.LocalTrackUnpublished, update);
          room.off(RoomEvent.ParticipantPermissionsChanged, onPerms);
        };
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Lỗi không xác định');
      }
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      detach?.();
      if (mountedRoom) void mountedRoom.disconnect();
      void leaveVoice();
    };
  }, [socket]);

  async function toggleMic() {
    if (!canPublish) return;
    setBusy(true);
    try {
      const next = !micEnabled;
      await setLocalMic(next);
      setMicEnabled(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không bật được mic');
    } finally {
      setBusy(false);
    }
  }

  function forceMute(targetId: string) {
    if (!socket) return;
    socket.emit('voice:test_force_mute', { targetPlayerId: targetId }, (res) => {
      if (!res.ok) setError(res.error);
    });
  }

  const playerById = new Map(players.map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-300">🎙 Voice</h3>
        <span
          className={
            status === 'connected'
              ? 'text-xs text-emerald-400'
              : status === 'connecting'
              ? 'text-xs text-amber-400'
              : status === 'error'
              ? 'text-xs text-rose-400'
              : 'text-xs text-neutral-400'
          }
        >
          {status}
        </span>
      </div>

      <ul className="space-y-1 text-sm">
        {participants.map((vp) => {
          const player = playerById.get(vp.identity);
          const name = player?.nickname ?? vp.identity.slice(0, 8);
          const isMe = vp.identity === myPlayerId;
          return (
            <li
              key={vp.identity}
              className="flex items-center justify-between rounded-md bg-neutral-950/50 px-2 py-1.5"
            >
              <span className="flex items-center gap-2">
                <span
                  className={
                    vp.isSpeaking
                      ? 'h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/40'
                      : vp.isMicEnabled
                      ? 'h-2 w-2 rounded-full bg-neutral-500'
                      : 'h-2 w-2 rounded-full bg-rose-700/70'
                  }
                  aria-label={vp.isSpeaking ? 'speaking' : vp.isMicEnabled ? 'mic on' : 'mic off'}
                />
                <span>
                  {name}
                  {isMe && ' (bạn)'}
                </span>
              </span>
              {isHost && !isMe && (
                <button
                  type="button"
                  onClick={() => forceMute(vp.identity)}
                  className="rounded border border-rose-500/40 px-2 py-0.5 text-xs text-rose-300 hover:bg-rose-500/10 transition"
                  title="Test: tắt mic người này từ server"
                >
                  Mute
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={toggleMic}
        disabled={!canPublish || status !== 'connected' || busy}
        className={`mt-1 rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-40 ${
          micEnabled
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
            : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
        }`}
      >
        {micEnabled ? '🎙 Mic ON (bấm để tắt)' : '🎙 Mic OFF (bấm để bật)'}
      </button>

      {!canPublish && <p className="text-xs text-rose-400">Server đã tắt mic của bạn</p>}
      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div ref={audioContainerRef} className="hidden" />
    </div>
  );
}
