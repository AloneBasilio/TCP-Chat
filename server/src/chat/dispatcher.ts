import * as authService from '../auth/auth.service';
import { ClientMessage } from '../protocol/protocol';
import { ClientSession } from './session';
import { joinRoom, leaveRoom, listAllRooms, roomMemberCount } from './room.service';
import { fetchHistory, handleOutgoingMessage } from '../chat/message.service';

const MAX_MESSAGE_LENGTH = 4000;

export async function dispatch(session: ClientSession, raw: any): Promise<void> {
  if (!raw || typeof raw.type !== 'string') {
    session.sendError('mensagem malformada: campo "type" em falta');
    return;
  }

  const msg = raw as ClientMessage;

  // Unauthenticated clients may only register, login, or pong.
  if (!session.authenticated && !['register', 'login', 'pong'].includes(msg.type)) {
    session.sendError('autenticação necessária: envie "register" ou "login" primeiro');
    return;
  }

  switch (msg.type) {
    case 'register': {
      const result = await authService.register(msg.username, msg.password);
      if (result.success) {
        session.username = result.username;
        session.send({ type: 'auth_result', success: true, token: result.token, username: result.username });
        session.sendSystem(`bem-vindo, ${result.username}!`);
      } else {
        session.send({ type: 'auth_result', success: false, error: result.error });
      }
      return;
    }

    case 'login': {
      const result = await authService.login(msg.username, msg.password);
      if (result.success) {
        session.username = result.username;
        session.send({ type: 'auth_result', success: true, token: result.token, username: result.username });
        session.sendSystem(`sessão iniciada como ${result.username}`);
      } else {
        session.send({ type: 'auth_result', success: false, error: result.error });
      }
      return;
    }

    case 'pong': {
      session.lastPongAt = Date.now();
      session.awaitingPong = false;
      return;
    }

    case 'join': {
      if (!msg.room || typeof msg.room !== 'string') {
        session.sendError('"room" é obrigatório');
        return;
      }
      await joinRoom(session, msg.room);
      session.send({ type: 'joined', room: msg.room, members: roomMemberCount(msg.room) });

      const history = await fetchHistory(msg.room);
      session.send({ type: 'history', room: msg.room, messages: history });
      return;
    }

    case 'leave': {
      if (!msg.room) {
        session.sendError('"room" é obrigatório');
        return;
      }
      leaveRoom(session, msg.room);
      session.send({ type: 'left', room: msg.room });
      return;
    }

    case 'message': {
      if (!msg.room || !session.rooms.has(msg.room)) {
        session.sendError(`entre na sala "${msg.room}" antes de enviar mensagens`);
        return;
      }
      if (!msg.content || typeof msg.content !== 'string' || !msg.content.trim()) {
        session.sendError('conteúdo da mensagem vazio');
        return;
      }
      if (msg.content.length > MAX_MESSAGE_LENGTH) {
        session.sendError(`mensagem excede o limite de ${MAX_MESSAGE_LENGTH} caracteres`);
        return;
      }
      await handleOutgoingMessage(msg.room, session.username!, msg.content);
      return;
    }

    case 'list_rooms': {
      const rooms = await listAllRooms();
      session.send({ type: 'rooms', rooms });
      return;
    }

    case 'history': {
      if (!msg.room) {
        session.sendError('"room" é obrigatório');
        return;
      }
      const history = await fetchHistory(msg.room, msg.limit);
      session.send({ type: 'history', room: msg.room, messages: history });
      return;
    }

    default:
      session.sendError(`tipo de mensagem desconhecido: "${(msg as any).type}"`);
  }
}
