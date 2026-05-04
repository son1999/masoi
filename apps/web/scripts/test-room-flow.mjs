import { io } from 'socket.io-client';

const SERVER = 'http://localhost:4000';

async function login(nickname) {
  const res = await fetch(`${SERVER}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

function connect(token) {
  return io(SERVER, { transports: ['websocket'], auth: { token } });
}

function on(socket, event) {
  return new Promise((resolve) => socket.once(event, (...args) => resolve(args)));
}

function emit(socket, event, ...args) {
  return new Promise((resolve, reject) => {
    const cb = (res) => (res?.ok === false ? reject(new Error(res.error)) : resolve(res));
    socket.emit(event, ...args, cb);
    setTimeout(() => reject(new Error(`${event} timeout`)), 5000);
  });
}

const tests = [];
function expect(label, cond) {
  tests.push({ label, pass: !!cond });
  console.log(`${cond ? 'OK ' : 'FAIL'} ${label}`);
}

try {
  const a = await login('Alice');
  const b = await login('Bob');
  console.log(`logged in: A=${a.playerId.slice(0, 8)} B=${b.playerId.slice(0, 8)}`);

  const sa = connect(a.token);
  const sb = connect(b.token);
  await Promise.all([on(sa, 'connect'), on(sb, 'connect')]);

  // 1. Alice creates room
  const createRes = await emit(sa, 'room:create');
  const room = createRes.data;
  expect('Alice creates room', room && room.joinCode.length === 6 && room.players.length === 1);
  expect('Alice is host', room.hostId === a.playerId);

  // 2. Bob joins via code
  const bobJoinedPromise = on(sa, 'room:player_joined');
  const joinRes = await emit(sb, 'room:join', { joinCode: room.joinCode });
  expect('Bob joins room', joinRes.data && joinRes.data.players.length === 2);
  const [joinedPlayer] = await bobJoinedPromise;
  expect('Alice receives player_joined event for Bob', joinedPlayer.id === b.playerId);

  // 3. Bob sends chat
  const chatPromise = on(sa, 'chat:message');
  await emit(sb, 'chat:send', { text: 'Chào mọi người!' });
  const [msg] = await chatPromise;
  expect('Alice receives chat from Bob', msg.text === 'Chào mọi người!' && msg.playerId === b.playerId);

  // 4. Bob leaves
  const leftPromise = on(sa, 'room:player_left');
  await emit(sb, 'room:leave');
  const [leftId] = await leftPromise;
  expect('Alice receives player_left event for Bob', leftId === b.playerId);

  sa.disconnect();
  sb.disconnect();

  const failed = tests.filter((t) => !t.pass);
  console.log(`\n${tests.length - failed.length}/${tests.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
} catch (err) {
  console.error('TEST ERROR:', err.message);
  process.exit(1);
}
