import { Redis } from 'ioredis';
import { default as Redlock } from 'redlock';
import { z } from 'zod';

import { getEnv } from './env.js';

const env = z.object({
    REDIS_URL: z.string(),
    REDIS_PREFIX: z.string().optional(),
}).parse(
    getEnv(),
);

export const redisPrefix = env.REDIS_PREFIX ?? '';

export const connectRedis = () => new Redis(
    env.REDIS_URL,
);

export const redis = connectRedis();

export const redlock = new Redlock([ redis ]);
