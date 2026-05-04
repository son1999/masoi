import { io } from 'socket.io-client';

const socket = io('http://localhost:4000', { transports: ['websocket'] });

const timeout = setTimeout(() => {
  console.error('Test failed: timeout (no pong within 5s)');
  process.exit(1);
}, 5000);

socket.on('connect', () => {
  const sentAt = Date.now();
  socket.emit('ping:test', { sentAt }, (pong) => {
    clearTimeout(timeout);
    const rtt = Date.now() - pong.sentAt;
    console.log(`OK: ping=${rtt}ms, server reported ts=${pong.serverTime}`);
    socket.disconnect();
    process.exit(0);
  });
});

socket.on('connect_error', (err) => {
  clearTimeout(timeout);
  console.error('Connect error:', err.message);
  process.exit(1);
});
