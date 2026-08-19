import dotenv from 'dotenv';

dotenv.config();

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

export const config = {
  instanceId: process.env.INSTANCE_ID || `srv-${Math.random().toString(36).slice(2, 8)}`,

  tcp: {
    port: parseInt(process.env.TCP_PORT || '3000', 10),
  },

  ws: {
    port: parseInt(process.env.WS_PORT || '8080', 10),
  },

  tls: {
    enabled: bool(process.env.TLS_ENABLED, false),
    certPath: process.env.TLS_CERT_PATH || '/app/certs/server.crt',
    keyPath: process.env.TLS_KEY_PATH || '/app/certs/server.key',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-prod',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },

  heartbeat: {
    intervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10),
    timeoutMs: parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '15000', 10),
  },

  postgres: {
    host: process.env.PG_HOST || 'postgres',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    user: process.env.PG_USER || 'chat',
    password: process.env.PG_PASSWORD || 'chat',
    database: process.env.PG_DATABASE || 'chat',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379',
    channel: process.env.REDIS_CHANNEL || 'chat:messages',
  },

  defaultRooms: (process.env.DEFAULT_ROOMS || 'general,random')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean),

  historyLimit: parseInt(process.env.HISTORY_LIMIT || '20', 10),
};
