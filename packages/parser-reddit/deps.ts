import Got from 'got';
import { z } from 'zod';

import { createDefaultLogger } from '@mediabot/app/log';
import { createPrismaClient } from '@mediabot/app/prisma';
import { createRedisManager } from '@mediabot/app/redis';
import { loadEnv } from '@mediabot/utils/loadEnv';

export const env = z.object({
    DATABASE_URL: z.string(),

    REDIS_URL: z.string(),
    REDIS_PREFIX: z.string().default(''),
}).parse(
    await loadEnv([
        '',
        'parser-reddit',
        process.env,
    ]),
);

export const log = createDefaultLogger();

export const redis = createRedisManager({
    url: env.REDIS_URL,
    prefix: env.REDIS_PREFIX,
});

export const prisma = createPrismaClient(env.DATABASE_URL);

export const got = Got.extend({
    headers: {
        Accept: 'application/json',
    },
});
