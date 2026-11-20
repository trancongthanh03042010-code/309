import type { Server as HttpServer } from 'http';
import type { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from './db.ts';
import { hashToken } from './db_social.ts';

interface ClientMeta {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  joinedStreams: Set<string>;
}

const userSockets = new Map<string, Set<ClientMeta>>();
const streamViewers = new Map<string, Set<string>>();

function safeSend(ws: WebSocket, event: string, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, payload, ts: new Date().toISOString() }));
  }
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  const set = userSockets.get(userId);
  if (!set) return;
  for (const meta of set) {
    safeSend(meta.ws, event, payload);
  }
}

export function emitToUsers(userIds: string[], event: string, payload: unknown): void {
  for (const id of new Set(userIds)) {
    emitToUser(id, event, payload);
  }
}

export function broadcastSocialEvent(event: string, payload: unknown): void {
  for (const set of userSockets.values()) {
    for (const meta of set) {
      safeSend(meta.ws, event, payload);
    }
  }
}

export function emitToStream(streamId: string, event: string, payload: unknown): void {
  for (const set of userSockets.values()) {
    for (const meta of set) {
      if (meta.joinedStreams.has(streamId)) {
        safeSend(meta.ws, event, payload);
      }
    }
  }
}

export function isUserOnline(userId: string): boolean {
  const set = userSockets.get(userId);
  return Boolean(set && set.size > 0);
}

function updateStreamViewerCount(streamId: string): void {
  const activeCount = streamViewers.get(streamId)?.size || 0;
  const row = db.prepare('SELECT peak_viewers, status FROM social_livestreams WHERE id = ?').get(streamId) as
    | { peak_viewers: number; status: string }
    | undefined;
  if (!row || row.status !== 'live') return;
  const displayCount = Math.max(1, activeCount);
  const nextPeak = Math.max(row.peak_viewers || 1, displayCount);
  db.prepare('UPDATE social_livestreams SET viewer_count = ?, peak_viewers = ? WHERE id = ?').run(
    displayCount,
    nextPeak,
    streamId
  );
  broadcastSocialEvent('stream:viewer_count', {
    streamId,
    viewerCount: displayCount,
    peakViewers: nextPeak,
  });
}

function authenticateUpgrade(req: IncomingMessage): { userId: string; sessionId: string } | null {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const token = url.searchParams.get('token') || '';
    if (!token) return null;
    const tokenHash = hashToken(token);
    const now = new Date().toISOString();
    const row = db
      .prepare(
        `SELECT s.id as session_id, s.user_id, u.status
         FROM social_sessions s
         JOIN social_users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.is_active = 1 AND s.expires_at > ? AND u.status = 'active'
         LIMIT 1`
      )
      .get(tokenHash, now) as { session_id: string; user_id: string; status: string } | undefined;
    if (!row) return null;
    return { userId: row.user_id, sessionId: row.session_id };
  } catch {
    return null;
  }
}

export function attachSocialWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const reqPath = (req.url || '').split('?')[0];
    if (reqPath !== '/ws/social') return;

    const auth = authenticateUpgrade(req);
    if (!auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, auth);
    });
  });

  wss.on('connection', (ws: WebSocket, auth: { userId: string; sessionId: string }) => {
    const meta: ClientMeta = {
      ws,
      userId: auth.userId,
      sessionId: auth.sessionId,
      joinedStreams: new Set(),
    };

    if (!userSockets.has(auth.userId)) {
      userSockets.set(auth.userId, new Set());
    }
    userSockets.get(auth.userId)!.add(meta);

    db.prepare("UPDATE social_users SET online_status = 'online', updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      auth.userId
    );
    broadcastSocialEvent('presence:update', { userId: auth.userId, status: 'online' });
    safeSend(ws, 'ws:ready', { userId: auth.userId, connectedAt: new Date().toISOString() });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event?: string; payload?: Record<string, unknown> };
        const event = msg.event;
        const p = msg.payload || {};

        if (event === 'ping') {
          safeSend(ws, 'pong', { ts: Date.now() });
          return;
        }

        if (event === 'chat:typing' && typeof p.chatId === 'string') {
          const members = db
            .prepare('SELECT user_id FROM social_chat_members WHERE chat_id = ? AND user_id != ?')
            .all(p.chatId, auth.userId) as Array<{ user_id: string }>;
          emitToUsers(
            members.map((m) => m.user_id),
            'chat:typing',
            { chatId: p.chatId, userId: auth.userId, isTyping: Boolean(p.isTyping) }
          );
          return;
        }

        if (event === 'stream:join' && typeof p.streamId === 'string') {
          const stream = db.prepare('SELECT banned_users_json, status FROM social_livestreams WHERE id = ?').get(p.streamId) as
            | { banned_users_json: string; status: string }
            | undefined;
          if (!stream || stream.status !== 'live') return;
          const banned = JSON.parse(stream.banned_users_json || '[]') as string[];
          if (banned.includes(auth.userId)) {
            safeSend(ws, 'stream:banned', { streamId: p.streamId });
            return;
          }
          meta.joinedStreams.add(p.streamId);
          if (!streamViewers.has(p.streamId)) streamViewers.set(p.streamId, new Set());
          streamViewers.get(p.streamId)!.add(auth.userId);
          updateStreamViewerCount(p.streamId);
          return;
        }

        if (event === 'stream:leave' && typeof p.streamId === 'string') {
          meta.joinedStreams.delete(p.streamId);
          streamViewers.get(p.streamId)?.delete(auth.userId);
          updateStreamViewerCount(p.streamId);
          return;
        }

        // Real WebRTC P2P signaling over WebSocket
        if (
          (event === 'rtc:call_invite' ||
            event === 'rtc:call_answer' ||
            event === 'rtc:ice_candidate' ||
            event === 'rtc:call_reject' ||
            event === 'rtc:call_hangup') &&
          typeof p.targetUserId === 'string'
        ) {
          emitToUser(p.targetUserId, event, {
            ...p,
            fromUserId: auth.userId,
          });
        }
      } catch {
        // ignore malformed frames
      }
    });

    ws.on('close', () => {
      const set = userSockets.get(auth.userId);
      if (set) {
        set.delete(meta);
        if (set.size === 0) {
          userSockets.delete(auth.userId);
          db.prepare("UPDATE social_users SET online_status = 'offline', updated_at = ? WHERE id = ?").run(
            new Date().toISOString(),
            auth.userId
          );
          broadcastSocialEvent('presence:update', { userId: auth.userId, status: 'offline' });
        }
      }
      for (const streamId of meta.joinedStreams) {
        streamViewers.get(streamId)?.delete(auth.userId);
        updateStreamViewerCount(streamId);
      }
    });
  });
}
