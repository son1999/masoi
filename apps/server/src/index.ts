import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server, type DefaultEventsMap } from 'socket.io';
import {
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@ma-soi/shared';
import { issueSession, validateNickname, verifyToken } from './auth.js';
import { MemoryRoomStore } from './store/MemoryRoomStore.js';
import { registerHandlers } from './socket/handlers.js';

const PORT = Number(process.env.PORT ?? 4000);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

const app = Fastify({ logger: true });

await app.register(cors, { origin: WEB_ORIGIN });

const store = new MemoryRoomStore();

app.get('/health', async () => ({ ok: true, ts: Date.now() }));

app.post<{ Body: { nickname?: string } }>('/auth/login', async (req, reply) => {
  const result = validateNickname(req.body?.nickname);
  if (typeof result !== 'string') {
    return reply.code(400).send({ ok: false, error: result.error });
  }
  const session = issueSession(result);
  return { ok: true, data: session };
});

await app.listen({ port: PORT, host: '0.0.0.0' });

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>(app.server, {
  cors: { origin: WEB_ORIGIN },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string') {
    return next(new Error('Thiếu token đăng nhập'));
  }
  const claims = verifyToken(token);
  if (!claims) return next(new Error('Token không hợp lệ'));
  socket.data.playerId = claims.playerId;
  socket.data.nickname = claims.nickname;
  next();
});

registerHandlers(io, store);

app.log.info('Socket.IO ready');
