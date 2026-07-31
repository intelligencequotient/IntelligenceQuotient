import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { DoubtsService } from './doubts.service';
import { supabase } from '../../config/supabase.config';

@WebSocketGateway({ namespace: '/doubts', cors: true }) //
export class DoubtsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly doubtsService: DoubtsService) {}

  /**
   * Validates the Supabase JWT supplied in the handshake and derives the
   * user's identity/role from the database.
   *
   * SECURITY: identity is NEVER taken from the client-supplied handshake
   * payload — a client could otherwise claim any userId or role and
   * impersonate another user over the socket.
   */
  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;

    if (!token) {
      client.emit('auth:error', { message: 'Missing auth token' });
      client.disconnect();
      return;
    }

    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        client.emit('auth:error', { message: 'Invalid or expired token' });
        client.disconnect();
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('full_name, role')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        client.emit('auth:error', { message: 'User profile not found' });
        client.disconnect();
        return;
      }

      client.data.userId = user.id;
      client.data.role = profile.role;
      client.data.name = profile.full_name;

      console.log(`Client connected: ${client.id} as ${client.data.role}`);
    } catch (err) {
      console.error('Socket auth failed:', err);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('room:join')
  handleJoinRoom(
    @MessageBody() data: { doubtId: string },
    @ConnectedSocket() client: Socket
  ) {
    client.join(data.doubtId);
    console.log(`Client ${client.id} joined doubt room ${data.doubtId}`);
  }

  @SubscribeMessage('room:leave')
  handleLeaveRoom(
    @MessageBody() data: { doubtId: string },
    @ConnectedSocket() client: Socket
  ) {
    client.leave(data.doubtId);
  }

  @SubscribeMessage('message:send')
  async handleMessage(
    @MessageBody() payload: { doubtId: string; text: string; imageUrl?: string },
    @ConnectedSocket() client: Socket
  ) {
    try {
      // Insert into Supabase
      await this.doubtsService.sendMessage(payload.doubtId, client.data.userId, payload.text, payload.imageUrl);

      const messagePayload = {
        id: Math.random().toString(36).substring(7), // Supabase created an ID, but for real-time broadcast this suffices, or we could fetch the generated ID.
        senderId: client.data.userId,
        senderRole: client.data.role,
        text: payload.text,
        imageUrl: payload.imageUrl,
        sentAt: new Date().toISOString(),
      };

      this.server.to(payload.doubtId).emit('message:new', messagePayload);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @MessageBody() payload: { doubtId: string },
    @ConnectedSocket() client: Socket
  ) {
    client.to(payload.doubtId).emit('typing:start', { doubtId: payload.doubtId, senderRole: client.data.role });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @MessageBody() payload: { doubtId: string },
    @ConnectedSocket() client: Socket
  ) {
    client.to(payload.doubtId).emit('typing:stop', { doubtId: payload.doubtId, senderRole: client.data.role });
  }

  @SubscribeMessage('doubt:request_list')
  async handleRequestList(@ConnectedSocket() client: Socket) {
    try {
      if (client.data.role === 'student') {
        const list = await this.doubtsService.getMyDoubts(client.data.userId);
        const normalizedList = list.map((d: any) => ({
          ...d,
          studentId: d.student?.id || d.student_id,
          subject: d.questions?.subject || d.subject || 'General',
          snippet: d.questions?.question_text || d.snippet || 'No text provided',
          time: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
        client.emit('doubt:list', normalizedList);
      } else {
        const list = await this.doubtsService.findAll();
        const normalizedList = list.map((d: any) => ({
          ...d,
          studentId: d.student?.id || d.student_id,
          subject: d.questions?.subject || d.subject || 'General',
          snippet: d.questions?.question_text || d.snippet || 'No text provided',
          time: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
        client.emit('doubt:list', normalizedList);
      }
    } catch (err) {
      console.error('Failed to fetch doubts:', err);
    }
  }

  @SubscribeMessage('doubt:raise')
  async handleRaiseDoubt(
    @MessageBody() payload: { subject: string; text: string },
    @ConnectedSocket() client: Socket
  ) {
    try {
      // Create doubt in Supabase
      const doubt = await this.doubtsService.create(client.data.userId, {
        subject: payload.subject,
        snippet: payload.text,
      });

      // Format payload for frontend
      const newDoubt = {
        id: doubt.id,
        status: doubt.status,
        subject: payload.subject, // We attach the subject manually for the real-time broadcast since it's not in the doubt row
        snippet: payload.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        studentId: client.data.userId,
        created_at: doubt.created_at,
        questions: {
          subject: payload.subject,
          question_text: payload.text,
        }
      };
      
      // Broadcast to ALL connected clients
      this.server.emit('doubt:new', newDoubt);
    } catch (err) {
      console.error('Failed to raise doubt:', err);
    }
  }

  @SubscribeMessage('doubt:resolve')
  handleResolveDoubt(
    @MessageBody() payload: { doubtId: string },
    @ConnectedSocket() client: Socket
  ) {
    if (!this.isTeacher(client)) return;
    // Broadcast resolution so UIs can remove it instantly
    this.server.emit('doubt:resolved', { doubtId: payload.doubtId });
  }

  @SubscribeMessage('doubt:accept')
  handleAcceptDoubt(
    @MessageBody() payload: { doubtId: string },
    @ConnectedSocket() client: Socket
  ) {
    if (!this.isTeacher(client)) return;
    this.server.emit('doubt:accepted', { doubtId: payload.doubtId });
  }

  @SubscribeMessage('session:live_start')
  handleLiveSessionStart(
    @MessageBody() payload: { doubtId: string, meetLink: string },
    @ConnectedSocket() client: Socket
  ) {
    if (!this.isTeacher(client)) return;
    this.server.to(payload.doubtId).emit('session:live_start', { doubtId: payload.doubtId, meetLink: payload.meetLink });
  }

  /** Only teachers/admins may accept, resolve, or start a live session. */
  private isTeacher(client: Socket): boolean {
    return client.data.role === 'teacher' || client.data.role === 'admin';
  }
}