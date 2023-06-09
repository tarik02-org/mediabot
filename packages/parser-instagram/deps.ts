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

    PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
    PUPPETEER_ARGS: z.preprocess(
        (value: unknown) => typeof value === 'string' ? value.split(' ') : value,
        z.array(z.string()),
    ).optional(),
    PUPPETEER_DATA_PATH: z.string().optional(),
    PUPPETEER_REMOTE_URL: z.string().optional(),
    PUPPETEER_PROXY: z.string().optional(),
}).parse(
    await loadEnv([
        '',
        'parser-instagram',
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
