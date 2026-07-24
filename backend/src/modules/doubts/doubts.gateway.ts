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

/**
 * DoubtsGateway — Real-time WebSocket server for doubt chat rooms.
 * Frontend connects via: io('http://localhost:3000', { auth: { token: 'Bearer xxx' } })
 */
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true },
})
export class DoubtsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  /** Called when a client connects — validates their JWT */
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token?.replace('Bearer ', '');
      if (!token) { client.disconnect(); return; }

      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) { client.disconnect(); return; }

      // Get role
      const { data: profile } = await supabase
        .from('users')
        .select('full_name, role')
        .eq('id', user.id)
        .single();

      client.data.userId = user.id;
      client.data.role = profile?.role;
      client.data.name = profile?.full_name;

      console.log(`[Socket] Connected: ${profile?.full_name} (${profile?.role})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`[Socket] Disconnected: ${client.data?.name}`);
  }

  /** Student/Teacher joins a specific doubt room */
  @SubscribeMessage('join_room')
  handleJoinRoom(@MessageBody() data: { doubtId: string }, @ConnectedSocket() client: Socket) {
    client.join(`doubt:${data.doubtId}`);
    console.log(`[Socket] ${client.data.name} joined room: doubt:${data.doubtId}`);
  }

  /** Leave a doubt room */
  @SubscribeMessage('leave_room')
  handleLeaveRoom(@MessageBody() data: { doubtId: string }, @ConnectedSocket() client: Socket) {
    client.leave(`doubt:${data.doubtId}`);
  }

  /** Someone sends a message — save to DB and broadcast to the room */
  @SubscribeMessage('send_message')
  async handleMessage(
    @MessageBody() data: { doubtId: string; message_text: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Save to database
    const { data: message, error } = await supabase
      .from('doubt_messages')
      .insert({
        doubt_id: data.doubtId,
        sender_id: client.data.userId,
        message_text: data.message_text,
      })
      .select('id, message_text, sent_at, doubt_id')
      .single();

    if (error) {
      client.emit('error', { message: 'Failed to send message' });
      return;
    }

    // Broadcast to EVERYONE in this doubt room (including sender)
    this.server.to(`doubt:${data.doubtId}`).emit('new_message', {
      ...message,
      sender: {
        id: client.data.userId,
        full_name: client.data.name,
        role: client.data.role,
      },
    });
  }

  /** Typing indicators */
  @SubscribeMessage('typing_start')
  handleTypingStart(@MessageBody() data: { doubtId: string }, @ConnectedSocket() client: Socket) {
    client.to(`doubt:${data.doubtId}`).emit('user_typing', {
      name: client.data.name,
      role: client.data.role,
    });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(@MessageBody() data: { doubtId: string }, @ConnectedSocket() client: Socket) {
    client.to(`doubt:${data.doubtId}`).emit('user_stopped_typing', {
      name: client.data.name,
    });
  }

  /** Helper: notify a room about a doubt status change */
  notifyStatusChange(doubtId: string, status: string) {
    this.server.to(`doubt:${doubtId}`).emit('doubt_status_changed', { doubtId, status });
  }
}
