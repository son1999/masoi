import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'ws://localhost:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'dev-secret-32-chars-min-aaaaaaaaaaa';

const httpUrl = LIVEKIT_URL.replace(/^ws/, 'http');

const roomService = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

export function getLivekitUrl(): string {
  return LIVEKIT_URL;
}

export interface IssueTokenInput {
  roomName: string;
  identity: string;
  nickname: string;
  canPublish: boolean;
  canSubscribe: boolean;
}

export async function issueLivekitToken(input: IssueTokenInput): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: input.identity,
    name: input.nickname,
    ttl: '1h',
  });
  at.addGrant({
    room: input.roomName,
    roomJoin: true,
    canPublish: input.canPublish,
    canSubscribe: input.canSubscribe,
    canPublishData: true,
  });
  return at.toJwt();
}

export interface UpdateGrantInput {
  roomName: string;
  identity: string;
  canPublish: boolean;
  canSubscribe: boolean;
}

export async function updateParticipantGrants(input: UpdateGrantInput): Promise<void> {
  await roomService.updateParticipant(input.roomName, input.identity, undefined, {
    canPublish: input.canPublish,
    canSubscribe: input.canSubscribe,
    canPublishData: true,
  });
}

export async function muteAllTracks(roomName: string, identity: string): Promise<void> {
  const participants = await roomService.listParticipants(roomName);
  const target = participants.find((p) => p.identity === identity);
  if (!target) return;
  for (const track of target.tracks) {
    if (!track.muted) {
      await roomService.mutePublishedTrack(roomName, identity, track.sid, true);
    }
  }
}
