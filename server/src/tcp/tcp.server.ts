import net from 'net';
import tls from 'tls';
import fs from 'fs';
import { config } from '../config/config';
import { LineBuffer, safeParse } from '../protocol/protocol';
import { ClientSession, Connection } from '../chat/session';
import { leaveAllRooms } from '../chat/room.service';
import { dispatch } from '../chat/dispatcher';

function wrapSocket(socket: net.Socket): Connection {
  return {
    send: (raw: string) => {
      if (!socket.destroyed) socket.write(raw);
    },
    close: () => socket.end(),
    remote: `${socket.remoteAddress}:${socket.remotePort}`,
  };
}

function handleConnection(socket: net.Socket): void {
  socket.setEncoding('utf8');
  const session = new ClientSession(wrapSocket(socket), 'tcp');
  const lineBuffer = new LineBuffer();

  console.log(`[tcp] client connected: ${session.conn.remote} (session ${session.id})`);
  session.sendSystem('ligado ao servidor TCP Chat. Envie {"type":"login",...} ou {"type":"register",...}');

  socket.on('data', (chunk: string) => {
    let lines: string[];
    try {
      lines = lineBuffer.push(chunk);
    } catch (err) {
      session.sendError('buffer overflow, a fechar ligação');
      socket.destroy();
      return;
    }

    for (const line of lines) {
      const parsed = safeParse(line);
      if (parsed === null) {
        if (line.trim().length > 0) session.sendError('JSON inválido');
        continue;
      }
      dispatch(session, parsed).catch((err) => {
        console.error(`[tcp] dispatch error for session ${session.id}:`, err);
        session.sendError('erro interno do servidor');
      });
    }
  });

  socket.on('close', () => {
    console.log(`[tcp] client disconnected: ${session.conn.remote} (session ${session.id})`);
    leaveAllRooms(session);
  });

  socket.on('error', (err) => {
    console.error(`[tcp] socket error (${session.conn.remote}):`, err.message);
  });

  startHeartbeat(session, socket);
}

function startHeartbeat(session: ClientSession, socket: net.Socket): void {
  const interval = setInterval(() => {
    if (socket.destroyed) {
      clearInterval(interval);
      return;
    }

    if (session.awaitingPong && Date.now() - session.lastPongAt > config.heartbeat.timeoutMs) {
      console.log(`[tcp] heartbeat timeout, closing session ${session.id}`);
      clearInterval(interval);
      socket.destroy();
      return;
    }

    session.awaitingPong = true;
    session.send({ type: 'ping' });
  }, config.heartbeat.intervalMs);

  socket.on('close', () => clearInterval(interval));
}

export function startTcpServer(): net.Server | tls.Server {
  let server: net.Server | tls.Server;

  if (config.tls.enabled) {
    const options: tls.TlsOptions = {
      cert: fs.readFileSync(config.tls.certPath),
      key: fs.readFileSync(config.tls.keyPath),
    };
    server = tls.createServer(options, handleConnection);
    console.log('[tcp] TLS enabled');
  } else {
    server = net.createServer(handleConnection);
    console.log('[tcp] TLS disabled (plain TCP)');
  }

  server.listen(config.tcp.port, () => {
    console.log(`[tcp] listening on port ${config.tcp.port} (instance ${config.instanceId})`);
  });

  return server;
}
