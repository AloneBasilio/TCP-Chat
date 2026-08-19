import { v4 as uuidv4 } from 'uuid';
import { encode } from '../protocol/protocol';

/** Transport-agnostic connection: TCP socket and WebSocket both implement this. */
export interface Connection {
  send(raw: string): void;
  close(): void;
  remote: string;
}

export type Transport = 'tcp' | 'ws';

export class ClientSession {
  readonly id: string = uuidv4();
  readonly conn: Connection;
  readonly transport: Transport;

  username: string | null = null;
  rooms: Set<string> = new Set();

  lastPongAt: number = Date.now();
  awaitingPong = false;

  constructor(conn: Connection, transport: Transport) {
    this.conn = conn;
    this.transport = transport;
  }

  get authenticated(): boolean {
    return this.username !== null;
  }

  send(obj: unknown): void {
    this.conn.send(encode(obj));
  }

  sendError(message: string): void {
    this.send({ type: 'error', message });
  }

  sendSystem(message: string): void {
    this.send({ type: 'system', message });
  }

  close(): void {
    this.conn.close();
  }
}
