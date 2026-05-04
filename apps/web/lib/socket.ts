'use client';

import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@ma-soi/shared';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let current: GameSocket | null = null;
let currentToken: string | null = null;

export function getSocket(token: string): GameSocket {
  if (current && currentToken === token && current.connected) return current;
  if (current) current.disconnect();

  const socket: GameSocket = io(SERVER_URL, {
    transports: ['websocket'],
    auth: { token },
  });
  current = socket;
  currentToken = token;
  return socket;
}

export function disconnectSocket() {
  if (current) {
    current.disconnect();
    current = null;
    currentToken = null;
  }
}
