import { config } from './config/config';
import { initDatabase, pool } from './database/database';
import { connectRedis, disconnectRedis } from './redis/redis';
import { initCrossServerRelay } from './chat/message.service';
import { startTcpServer } from './tcp/tcp.server';
import { startWebSocketServer } from './websocket/websocket.server';

async function main() {
  console.log(`[boot] starting TCP Chat instance "${config.instanceId}"`);

  await initDatabase();
  await connectRedis();
  await initCrossServerRelay();

  const tcpServer = startTcpServer();
  const wss = startWebSocketServer();

  const shutdown = async (signal: string) => {
    console.log(`[boot] received ${signal}, shutting down gracefully...`);
    tcpServer.close();
    wss.close();
    await disconnectRedis();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[boot] fatal error during startup:', err);
  process.exit(1);
});
