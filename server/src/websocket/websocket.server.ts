import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import https from 'https';
import fs from 'fs';
import { config } from '../config/config';
import { safeParse } from '../protocol/protocol';
import { ClientSession, Connection } from '../chat/session';
import { leaveAllRooms } from '../chat/room.service';
import { dispatch } from '../chat/dispatcher';

function wrapSocket(ws: WebSocket, remote: string): Connection {
  return {
    send: (raw: string) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(raw.trimEnd());
    },
    close: () => ws.close(),
    remote,
  };
}

export function startWebSocketServer(): WebSocketServer {
  const httpServer = config.tls.enabled
    ? https.createServer({
        cert: fs.readFileSync(config.tls.certPath),
        key: fs.readFileSync(config.tls.keyPath),
      })
    : http.createServer();

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const remote = req.socket.remoteAddress ?? 'unknown';
    const session = new ClientSession(wrapSocket(ws, remote), 'ws');

    console.log(`[ws] client connected: ${remote} (session ${session.id})`);
    session.sendSystem('ligado ao servidor WebSocket Chat. Envie {"type":"login",...} ou {"type":"register",...}');

    ws.on('message', (data) => {
      const parsed = safeParse(data.toString());
      if (parsed === null) {
        session.sendError('JSON inválido');
        return;
      }
      dispatch(session, parsed).catch((err) => {
        console.error(`[ws] dispatch error for session ${session.id}:`, err);
        session.sendError('erro interno do servidor');
      });
    });

    ws.on('pong', () => {
      session.lastPongAt = Date.now();
      session.awaitingPong = false;
    });

    ws.on('close', () => {
      console.log(`[ws] client disconnected: ${remote} (session ${session.id})`);
      leaveAllRooms(session);
    });

    ws.on('error', (err) => {
      console.error(`[ws] socket error (${remote}):`, err.message);
    });

    const interval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(interval);
        return;
      }
      if (session.awaitingPong && Date.now() - session.lastPongAt > config.heartbeat.timeoutMs) {
        console.log(`[ws] heartbeat timeout, closing session ${session.id}`);
        clearInterval(interval);
        ws.terminate();
        return;
      }
      session.awaitingPong = true;
      session.send({ type: 'ping' });
      ws.ping();
    }, config.heartbeat.intervalMs);

    ws.on('close', () => clearInterval(interval));
  });

  httpServer.listen(config.ws.port, () => {
    console.log(`[ws] listening on port ${config.ws.port} (instance ${config.instanceId})`);
  });

  return wss;
}
