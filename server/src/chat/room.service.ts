import { ensureRoom, listRooms as listRoomsFromDb } from '../database/database';
import { ClientSession } from './session';

/**
 * Tracks which locally-connected sessions belong to which rooms.
 * This state is per-instance only; cross-instance fan-out happens via Redis
 * (see redis/redis.ts + chat/message.service.ts), not through this map.
 */
const localRooms: Map<string, Set<ClientSession>> = new Map();

export async function joinRoom(session: ClientSession, room: string): Promise<void> {
  await ensureRoom(room);

  if (!localRooms.has(room)) localRooms.set(room, new Set());
  localRooms.get(room)!.add(session);
  session.rooms.add(room);
}

export function leaveRoom(session: ClientSession, room: string): void {
  localRooms.get(room)?.delete(session);
  session.rooms.delete(room);
}

export function leaveAllRooms(session: ClientSession): void {
  for (const room of Array.from(session.rooms)) {
    leaveRoom(session, room);
  }
}

export function roomMemberCount(room: string): number {
  return localRooms.get(room)?.size ?? 0;
}

/** Broadcast to every session in `room` connected to THIS instance. */
export function broadcastLocal(room: string, obj: unknown, excludeSessionId?: string): void {
  const members = localRooms.get(room);
  if (!members) return;
  for (const session of members) {
    if (session.id === excludeSessionId) continue;
    session.send(obj);
  }
}

export async function listAllRooms(): Promise<string[]> {
  return listRoomsFromDb();
}
