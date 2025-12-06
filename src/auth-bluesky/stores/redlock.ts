import { RuntimeLock } from '@atproto/oauth-client-node';
import Redis from 'ioredis';
import Redlock from 'redlock';
import { Logger } from '@nestjs/common';

// Singleton to avoid creating new Redis connections on each request
let cachedRedlock: Redlock | null = null;
let cachedRedis: Redis | null = null;
let connectionPromise: Promise<void> | null = null;

export function createRequestLock(redisConfig: {
  host: string;
  port: number;
  tls?: boolean;
  password?: string;
}): RuntimeLock {
  const logger = new Logger('RequestLock');

  // Reuse existing connection if available
  if (!cachedRedis) {
    cachedRedis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      tls: redisConfig.tls ? {} : undefined,
      password: redisConfig.password,
      lazyConnect: true,
    });

    // Create connection promise for first-time connection
    connectionPromise = cachedRedis.connect().catch((err) => {
      logger.error('Failed to connect Redis for request lock', err);
      cachedRedis = null;
      connectionPromise = null;
      throw err;
    });
  }

  if (!cachedRedlock) {
    cachedRedlock = new Redlock([cachedRedis], {
      // The expected clock drift; for more details see:
      // http://redis.io/topics/distlock
      driftFactor: 0.01, // multiplied by lock ttl to determine drift time

      // The max number of times Redlock will attempt to lock a resource
      // before failing
      retryCount: 3,

      // the time in ms between attempts
      retryDelay: 200, // time in ms

      // the max time in ms randomly added to retries
      // to improve performance under high contention
      retryJitter: 200, // time in ms

      // The minimum remaining time on a lock before an extension is automatically
      // attempted with the `using` API.
      automaticExtensionThreshold: 500, // time in ms
    });
  }

  const redlock = cachedRedlock;

  return async (key: string, fn: () => Promise<any>) => {
    // Wait for Redis connection to be established on first use
    if (connectionPromise) {
      await connectionPromise;
    }

    const resource = `bluesky:lock:${key}`;
    const duration = 45000; // 45 second lock

    return await redlock.using([resource], duration, async () => {
      logger.debug(`Acquired lock for key: ${key}`);
      try {
        return await fn();
      } finally {
        logger.debug(`Released lock for key: ${key}`);
      }
    });
  };
}
