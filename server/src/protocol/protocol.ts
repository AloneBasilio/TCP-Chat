/**
 * JSON protocol used over both TCP (newline-delimited) and WebSocket (one frame per message).
 *
 * Client -> Server
 *   { type: "register", username, password }
 *   { type: "login", username, password }
 *   { type: "join", room }
 *   { type: "leave", room }
 *   { type: "message", room, content }
 *   { type: "list_rooms" }
 *   { type: "history", room, limit? }
 *   { type: "pong" }
 *
 * Server -> Client
 *   { type: "auth_result", success, token?, username?, error? }
 *   { type: "joined", room, members }
 *   { type: "left", room }
 *   { type: "message", room, from, content, timestamp, serverId }
 *   { type: "rooms", rooms }
 *   { type: "history", room, messages }
 *   { type: "system", message }
 *   { type: "error", message }
 *   { type: "ping" }
 */

export type ClientMessage =
  | { type: 'register'; username: string; password: string }
  | { type: 'login'; username: string; password: string }
  | { type: 'join'; room: string }
  | { type: 'leave'; room: string }
  | { type: 'message'; room: string; content: string }
  | { type: 'list_rooms' }
  | { type: 'history'; room: string; limit?: number }
  | { type: 'pong' };

export interface ChatMessage {
  type: 'message';
  room: string;
  from: string;
  content: string;
  timestamp: string;
  serverId: string;
}

export const PROTOCOL_DELIMITER = '\n';

export function encode(obj: unknown): string {
  return JSON.stringify(obj) + PROTOCOL_DELIMITER;
}

export function safeParse(line: string): any | null {
  try {
    const trimmed = line.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Buffers raw TCP stream chunks and yields complete newline-delimited JSON lines.
 * Necessary because TCP is a byte stream with no message boundaries: a single
 * `write()` from the client may arrive split across several `data` events, or
 * multiple messages may arrive concatenated in one event.
 */
export class LineBuffer {
  private buffer = '';
  private readonly maxBufferBytes: number;

  constructor(maxBufferBytes = 1024 * 1024) {
    this.maxBufferBytes = maxBufferBytes;
  }

  /** Feed a raw chunk, returns array of complete lines (without delimiter). */
  push(chunk: string): string[] {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, 'utf8') > this.maxBufferBytes) {
      // Guard against a malicious/broken client never sending a newline.
      this.buffer = '';
      throw new Error('line buffer overflow');
    }
    const parts = this.buffer.split(PROTOCOL_DELIMITER);
    this.buffer = parts.pop() ?? '';
    return parts;
  }
}
