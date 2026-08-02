import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { supabase } from '../../config/supabase.config';
import { verifySupabaseToken } from '../../common/auth/supabase-jwt';

/**
 * Live progress for long-running uploads.
 *
 * PDF extraction takes 1-2 minutes, during which the UI previously showed a
 * rotating list of guessed messages with no relationship to what was actually
 * happening. This gateway pushes real stage updates instead.
 *
 * Each user gets their own room (`upload:<userId>`), so progress for one
 * teacher's upload is never visible to another.
 */

export type UploadStage =
  | 'queued'
  | 'extracting'
  | 'classifying'
  | 'uploading-images'
  | 'saving'
  | 'complete'
  | 'failed';

export interface UploadProgress {
  runId: string;
  stage: UploadStage;
  message: string;
  /** 0-100; -1 when the stage has no meaningful percentage. */
  percent: number;
  processed?: number;
  inserted?: number;
  error?: string;
}

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true },
})
export class UploadsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(UploadsGateway.name);

  @WebSocketServer()
  server: Server;

  /**
   * The handshake is verified the same way as the doubts gateway: signature
   * first, role from the database, never from the token payload.
   */
  async handleConnection(client: Socket) {
    const ready = (async () => {
      try {
        const identity = await verifySupabaseToken(client.handshake.auth?.token ?? '');

        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', identity.userId)
          .single();

        if (!profile) {
          client.disconnect();
          return;
        }

        client.data.userId = identity.userId;
        client.data.role = profile.role;
      } catch {
        // Not an upload client — the doubts gateway shares this connection, so a
        // failed auth here must not tear down an otherwise valid socket.
      }
    })();

    client.data.uploadReady = ready;
    await ready;
  }

  /** A client asks to receive progress for its own uploads. */
  @SubscribeMessage('uploads:subscribe')
  async subscribe(@ConnectedSocket() client: Socket) {
    await client.data?.uploadReady?.catch(() => undefined);

    const userId = client.data?.userId;
    if (!userId) {
      client.emit('uploads:error', { message: 'Not authenticated.' });
      return;
    }

    // A socket may only ever join its own upload room.
    client.join(`upload:${userId}`);
    client.emit('uploads:subscribed', { ok: true });
  }

  @SubscribeMessage('uploads:unsubscribe')
  async unsubscribe(@ConnectedSocket() client: Socket) {
    const userId = client.data?.userId;
    if (userId) client.leave(`upload:${userId}`);
  }

  /** Pushes a progress update to the owning user. */
  emitProgress(userId: string, progress: UploadProgress) {
    this.server?.to(`upload:${userId}`).emit('uploads:progress', progress);
  }
}
