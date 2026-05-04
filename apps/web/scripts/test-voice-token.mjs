import { io } from 'socket.io-client';

const SERVER = 'http://localhost:4000';

function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('not a JWT');
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
}

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
  const a = await login('VoiceAlice');
  const b = await login('VoiceBob');

  const sa = io(SERVER, { transports: ['websocket'], auth: { token: a.token } });
  const sb = io(SERVER, { transports: ['websocket'], auth: { token: b.token } });
  await Promise.all([
    new Promise((r) => sa.once('connect', r)),
    new Promise((r) => sb.once('connect', r)),
  ]);

  // Voice token without being in a room → should error
  let outOfRoomError = false;
  try {
    await emit(sa, 'voice:token');
  } catch (err) {
    outOfRoomError = err.message.includes('chưa vào phòng');
  }
  expect('voice:token rejects when not in a room', outOfRoomError);

  // Create room with Alice, join with Bob
  const createRes = await emit(sa, 'room:create');
  const room = createRes.data;
  await emit(sb, 'room:join', { joinCode: room.joinCode });

  // Now Alice can get a voice token
  const tokenRes = await emit(sa, 'voice:token');
  const info = tokenRes.data;
  expect('voice:token returns url', typeof info.url === 'string' && info.url.startsWith('ws'));
  expect('voice:token returns identity = playerId', info.identity === a.playerId);
  expect('voice:token returns roomName = our roomId', info.roomName === room.id);

  const claims = decodeJwt(info.token);
  expect('token has correct identity (sub)', claims.sub === a.playerId);
  expect('token has video grant for our room', claims.video?.room === room.id && claims.video?.roomJoin === true);
  expect('token has canPublish + canSubscribe', claims.video?.canPublish === true && claims.video?.canSubscribe === true);
  expect('token has expiry in future', claims.exp * 1000 > Date.now());

  // Force mute test (host only) — Alice (host) mutes Bob
  // This will hit LiveKit's API. If LiveKit isn't running, the request will fail.
  let muteWorked = false;
  let muteErrMsg = null;
  try {
    await emit(sa, 'voice:test_force_mute', { targetPlayerId: b.playerId });
    muteWorked = true;
  } catch (err) {
    muteErrMsg = err.message;
  }
  if (muteWorked) {
    expect('host force-mute call succeeds (LiveKit running)', true);
  } else {
    console.log(`SKIP host force-mute (LiveKit not reachable): ${muteErrMsg}`);
  }

  // Non-host can't force-mute
  let nonHostBlocked = false;
  try {
    await emit(sb, 'voice:test_force_mute', { targetPlayerId: a.playerId });
  } catch (err) {
    nonHostBlocked = err.message.includes('chủ phòng');
  }
  expect('non-host cannot force-mute', nonHostBlocked);

  sa.disconnect();
  sb.disconnect();

  const failed = tests.filter((t) => !t.pass);
  console.log(`\n${tests.length - failed.length}/${tests.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
} catch (err) {
  console.error('TEST ERROR:', err.message);
  process.exit(1);
}
