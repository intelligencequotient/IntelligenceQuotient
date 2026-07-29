import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { supabase } from '../../config/supabase.config';
import { verifySupabaseToken } from '../../common/auth/supabase-jwt';
import { DoubtsService } from './doubts.service';
import { MAX_MESSAGE_LENGTH } from './dto/doubt.dto';

/**
 * DoubtsGateway — Real-time WebSocket server for doubt chat rooms.
 * Frontend connects via: io('http://localhost:3000', { auth: { token: 'Bearer xxx' } })
 *
 * Security model:
 *  - The handshake token signature is verified; the role is read from the DB, never from the token.
 *  - A socket may only join a doubt room it is a participant of, and may only send
 *    messages to rooms it has been granted write access to.
 *  - Access grants are re-validated periodically so revoked access cannot linger.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** How long a room access decision is cached on the socket before re-checking. */
const ACCESS_TTL_MS = 30_000;

/** Per-socket flood control. */
const RATE_LIMIT_WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 20;
const MAX_TYPING_EVENTS_PER_WINDOW = 40;

interface RoomGrant {
  canRead: boolean;
  canWrite: boolean;
  checkedAt: number;
}

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true },
})
export class DoubtsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly doubtsService: DoubtsService) { }

  /**
   * Called when a client connects. The handshake is asynchronous, but clients emit
   * `join_room` the instant they connect — so the promise is parked on the socket
   * and every handler awaits it before looking at the identity.
   */
  async handleConnection(client: Socket) {
    const ready = this.authenticate(client);
    client.data.ready = ready;
    await ready;
  }

  /** Verifies the JWT signature before trusting any claim, then loads the profile. */
  private async authenticate(client: Socket) {
    try {
      const identity = await verifySupabaseToken(client.handshake.auth?.token ?? '');

      // Role always comes from the database, never from the token payload.
      const { data: profile } = await supabase
        .from('users')
        .select('full_name, role')
        .eq('id', identity.userId)
        .single();

      if (!profile) {
        client.emit('auth_error', { message: 'User profile not found.' });
        client.disconnect();
        return;
      }

      client.data.userId = identity.userId;
      client.data.role = profile.role;
      client.data.name = profile.full_name;
      client.data.grants = new Map<string, RoomGrant>();
      client.data.counters = { windowStart: Date.now(), messages: 0, typing: 0 };

      console.log(`[Socket] Connected: ${profile.full_name} (${profile.role})`);
    } catch (e: any) {
      client.emit('auth_error', { message: e?.message ?? 'Authentication failed.' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`[Socket] Disconnected: ${client.data?.name}`);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async isAuthenticated(client: Socket): Promise<boolean> {
    await client.data?.ready?.catch(() => undefined);
    if (client.data?.userId) return true;
    client.emit('error', { message: 'Not authenticated.' });
    client.disconnect();
    return false;
  }

  private readDoubtId(client: Socket, data: any): string | null {
    const doubtId = typeof data?.doubtId === 'string' ? data.doubtId : '';
    if (!UUID_RE.test(doubtId)) {
      client.emit('error', { message: 'Invalid doubt id.' });
      return null;
    }
    return doubtId;
  }

  /** Returns the socket's access to a doubt, re-checking against the DB when stale. */
  private async getGrant(client: Socket, doubtId: string): Promise<RoomGrant> {
    const grants: Map<string, RoomGrant> = client.data.grants;
    const cached = grants.get(doubtId);
    if (cached && Date.now() - cached.checkedAt < ACCESS_TTL_MS) return cached;

    const access = await this.doubtsService.checkAccess(doubtId, {
      id: client.data.userId,
      role: client.data.role,
    });
    const grant: RoomGrant = { ...access, checkedAt: Date.now() };
    grants.set(doubtId, grant);
    return grant;
  }

  /** Simple fixed-window flood control so one socket cannot spam the room or the DB. */
  private withinRateLimit(client: Socket, kind: 'messages' | 'typing'): boolean {
    const counters = client.data.counters;
    const now = Date.now();
    if (now - counters.windowStart > RATE_LIMIT_WINDOW_MS) {
      counters.windowStart = now;
      counters.messages = 0;
      counters.typing = 0;
    }
    counters[kind] += 1;
    const max = kind === 'messages' ? MAX_MESSAGES_PER_WINDOW : MAX_TYPING_EVENTS_PER_WINDOW;
    if (counters[kind] > max) {
      if (kind === 'messages') {
        client.emit('error', { message: 'You are sending messages too quickly.' });
      }
      return false;
    }
    return true;
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  /** Student/Teacher joins a specific doubt room — only if they are a participant. */
  @SubscribeMessage('join_room')
  async handleJoinRoom(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    if (!(await this.isAuthenticated(client))) return;
    const doubtId = this.readDoubtId(client, data);
    if (!doubtId) return;

    const grant = await this.getGrant(client, doubtId);
    if (!grant.canRead) {
      client.emit('error', { message: 'You do not have access to this doubt.' });
      return;
    }

    client.join(`doubt:${doubtId}`);
    console.log(`[Socket] ${client.data.name} joined room: doubt:${doubtId}`);
  }

  /** Leave a doubt room */
  @SubscribeMessage('leave_room')
  async handleLeaveRoom(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    if (!(await this.isAuthenticated(client))) return;
    const doubtId = this.readDoubtId(client, data);
    if (!doubtId) return;

    client.leave(`doubt:${doubtId}`);
    client.data.grants?.delete(doubtId);
  }

  /** Someone sends a message — authorise, save to DB and broadcast to the room */
  @SubscribeMessage('send_message')
  async handleMessage(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    if (!(await this.isAuthenticated(client))) return;
    const doubtId = this.readDoubtId(client, data);
    if (!doubtId) return;
    if (!this.withinRateLimit(client, 'messages')) return;

    const text = typeof data?.message_text === 'string' ? data.message_text.trim() : '';
    if (!text) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      client.emit('error', { message: `Message exceeds ${MAX_MESSAGE_LENGTH} characters.` });
      return;
    }

    const grant = await this.getGrant(client, doubtId);
    if (!grant.canWrite) {
      client.emit('error', { message: 'You are not a participant in this doubt.' });
      return;
    }

    let message: any;
    try {
      message = await this.doubtsService.persistMessage(doubtId, client.data.userId, text);
    } catch {
      client.emit('error', { message: 'Failed to send message' });
      return;
    }

    // Broadcast to EVERYONE in this doubt room (including sender)
    this.server.to(`doubt:${doubtId}`).emit('new_message', {
      ...message,
      sender: {
        id: client.data.userId,
        full_name: client.data.name,
        role: client.data.role,
      },
    });
  }

  /** Typing indicators — only broadcast into rooms the socket is actually in. */
  @SubscribeMessage('typing_start')
  async handleTypingStart(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    if (!(await this.isAuthenticated(client))) return;
    const doubtId = this.readDoubtId(client, data);
    if (!doubtId) return;
    if (!this.withinRateLimit(client, 'typing')) return;
    if (!client.rooms.has(`doubt:${doubtId}`)) return;

    client.to(`doubt:${doubtId}`).emit('user_typing', {
      name: client.data.name,
      role: client.data.role,
    });
  }

  @SubscribeMessage('typing_stop')
  async handleTypingStop(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    if (!(await this.isAuthenticated(client))) return;
    const doubtId = this.readDoubtId(client, data);
    if (!doubtId) return;
    if (!this.withinRateLimit(client, 'typing')) return;
    if (!client.rooms.has(`doubt:${doubtId}`)) return;

    client.to(`doubt:${doubtId}`).emit('user_stopped_typing', {
      name: client.data.name,
    });
  }

  /** Helper: push a message created over REST (e.g. an image upload) to the room. */
  broadcastMessage(
    doubtId: string,
    message: any,
    sender: { id: string; full_name: string; role: string },
  ) {
    this.server?.to(`doubt:${doubtId}`).emit('new_message', { ...message, sender });
  }

  /** Helper: notify a room about a doubt status change */
  notifyStatusChange(doubtId: string, status: string) {
    this.server?.to(`doubt:${doubtId}`).emit('doubt_status_changed', { doubtId, status });
  }
}
