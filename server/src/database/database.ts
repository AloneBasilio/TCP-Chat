import { Pool } from 'pg';
import { config } from '../config/config';

export const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
  max: 10,
});

const SCHEMA_LOCK_KEY = 727272;

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      VARCHAR(64) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(64) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id         BIGSERIAL PRIMARY KEY,
        room       VARCHAR(64) NOT NULL,
        username   VARCHAR(64) NOT NULL,
        content    TEXT NOT NULL,
        server_id  VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages (room, created_at);`);

    for (const room of config.defaultRooms) {
      await client.query(`INSERT INTO rooms (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [room]);
    }

    console.log('[database] schema ready');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK_KEY]);
    client.release();
  }
}

export async function ensureRoom(name: string): Promise<void> {
  await pool.query(
    `INSERT INTO rooms (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
    [name]
  );
}

export async function listRooms(): Promise<string[]> {
  const res = await pool.query<{ name: string }>(`SELECT name FROM rooms ORDER BY name ASC`);
  return res.rows.map((r) => r.name);
}

export interface UserRecord {
  id: number;
  username: string;
  password_hash: string;
}

export async function createUser(username: string, passwordHash: string): Promise<UserRecord> {
  const res = await pool.query<UserRecord>(
    `INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, password_hash`,
    [username, passwordHash]
  );
  return res.rows[0];
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const res = await pool.query<UserRecord>(
    `SELECT id, username, password_hash FROM users WHERE username = $1`,
    [username]
  );
  return res.rows[0] ?? null;
}

export interface MessageRecord {
  id: number;
  room: string;
  username: string;
  content: string;
  server_id: string;
  created_at: string;
}

export async function saveMessage(
  room: string,
  username: string,
  content: string,
  serverId: string
): Promise<MessageRecord> {
  const res = await pool.query<MessageRecord>(
    `INSERT INTO messages (room, username, content, server_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, room, username, content, server_id, created_at`,
    [room, username, content, serverId]
  );
  return res.rows[0];
}

export async function getRecentMessages(room: string, limit: number): Promise<MessageRecord[]> {
  const res = await pool.query<MessageRecord>(
    `SELECT id, room, username, content, server_id, created_at
     FROM messages
     WHERE room = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [room, limit]
  );
  return res.rows.reverse();
}
