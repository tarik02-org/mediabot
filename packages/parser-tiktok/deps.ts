import { z } from 'zod';

import { createCache } from '@mediabot/app/cache';
import { createDefaultLogger } from '@mediabot/app/log';
import { createPrismaClient } from '@mediabot/app/prisma';
import { createRedisManager } from '@mediabot/app/redis';
import { loadEnv } from '@mediabot/utils/loadEnv';

export const env = z.object({
    REDIS_URL: z.string(),
    REDIS_PREFIX: z.string().default(''),

    DATABASE_URL: z.string(),
}).parse(
    await loadEnv([
        '',
        'parser-tiktok',
        process.env,
    ]),
);

export const log = createDefaultLogger();

export const redis = createRedisManager({
    url: env.REDIS_URL,
    prefix: env.REDIS_PREFIX,
});

export const prisma = createPrismaClient(env.DATABASE_URL);

export const cache = createCache({
    prisma,
    redis,
    log,
});
