import { createClient, RedisClientType } from 'redis';
import { config } from '../config/config';
import { ChatMessage } from '../protocol/protocol';

let publisher: RedisClientType;
let subscriber: RedisClientType;

export async function connectRedis(): Promise<void> {
  publisher = createClient({ url: config.redis.url });
  subscriber = createClient({ url: config.redis.url });

  publisher.on('error', (err) => console.error('[redis:pub] error', err));
  subscriber.on('error', (err) => console.error('[redis:sub] error', err));

  await publisher.connect();
  await subscriber.connect();

  console.log(`[redis] connected (${config.redis.url})`);
}

/** Publish a chat message so every other chat-server instance can fan it out locally. */
export async function publishMessage(msg: ChatMessage): Promise<void> {
  await publisher.publish(config.redis.channel, JSON.stringify(msg));
}

/** Subscribe once at startup; handler receives every message published by any instance. */
export async function subscribeToChat(handler: (msg: ChatMessage) => void): Promise<void> {
  await subscriber.subscribe(config.redis.channel, (raw) => {
    try {
      const msg = JSON.parse(raw) as ChatMessage;
      handler(msg);
    } catch (err) {
      console.error('[redis] failed to parse pub/sub message', err);
    }
  });
  console.log(`[redis] subscribed to channel "${config.redis.channel}"`);
}

export async function disconnectRedis(): Promise<void> {
  await Promise.allSettled([publisher?.quit(), subscriber?.quit()]);
}
