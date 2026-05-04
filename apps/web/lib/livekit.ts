'use client';

import { Room, RoomEvent } from 'livekit-client';
import type { GameSocket } from './socket';

let activeRoom: Room | null = null;

export async function joinVoice(socket: GameSocket): Promise<Room> {
  if (activeRoom) {
    await activeRoom.disconnect();
    activeRoom = null;
  }

  const tokenInfo = await new Promise<{ url: string; token: string; identity: string; roomName: string }>(
    (resolve, reject) => {
      socket.emit('voice:token', (res) => {
        if (!res.ok) reject(new Error(res.error));
        else resolve(res.data);
      });
      setTimeout(() => reject(new Error('voice:token timeout')), 5000);
    },
  );

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });
  await room.connect(tokenInfo.url, tokenInfo.token);
  activeRoom = room;
  return room;
}

export async function leaveVoice() {
  if (activeRoom) {
    await activeRoom.disconnect();
    activeRoom = null;
  }
}

export async function setLocalMic(enabled: boolean): Promise<void> {
  if (!activeRoom) return;
  await activeRoom.localParticipant.setMicrophoneEnabled(enabled);
}

export { RoomEvent };
