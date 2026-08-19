import { config } from '../config/config';
import { getRecentMessages, saveMessage, MessageRecord } from '../database/database';
import { publishMessage, subscribeToChat } from '../redis/redis';
import { ChatMessage } from '../protocol/protocol';
import { broadcastLocal } from './room.service';

/**
 * Handles a chat message coming from a locally-connected client:
 *   1. persist it in PostgreSQL (durable history)
 *   2. broadcast it to local room members immediately
 *   3. publish it on Redis so sibling chat-server instances relay it to
 *      their own locally-connected clients in the same room
 */
export async function handleOutgoingMessage(room: string, username: string, content: string): Promise<void> {
  const saved: MessageRecord = await saveMessage(room, username, content, config.instanceId);

  const chatMessage: ChatMessage = {
    type: 'message',
    room,
    from: username,
    content,
    timestamp: saved.created_at,
    serverId: config.instanceId,
  };

  broadcastLocal(room, chatMessage);
  await publishMessage(chatMessage);
}

/** Wire up the Redis subscription once at boot: relay other instances' messages locally. */
export async function initCrossServerRelay(): Promise<void> {
  await subscribeToChat((msg) => {
    // Messages this very instance published were already broadcast locally
    // in handleOutgoingMessage(); avoid delivering them twice.
    if (msg.serverId === config.instanceId) return;
    broadcastLocal(msg.room, msg);
  });
}

export async function fetchHistory(room: string, limit: number = config.historyLimit): Promise<MessageRecord[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  return getRecentMessages(room, safeLimit);
}
