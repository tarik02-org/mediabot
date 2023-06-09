import { z } from 'zod';

import { loadEnv } from '@mediabot/utils/loadEnv';

export const env = z.intersection(
    z.object({
        TELEGRAM_API_ROOT: z.string().optional(),
        BOT_TOKEN: z.string(),

        TEMPORARY_CHAT_ID: z.coerce.number(),
        SERVICE_NAME: z.string(),
        INLINE_MODE: z.enum([
            'request',
            'immediate',
        ]).default('request'),

        DATABASE_URL: z.string(),

        REDIS_URL: z.string(),
        REDIS_PREFIX: z.string().default(''),
    }),
    z.union([
        z.object({
            BOT_MODE: z.literal('polling').default('polling'),
        }),
        z.object({
            BOT_MODE: z.literal('webhook'),
            BOT_WEBHOOK_PORT: z.coerce.number().default(80),
            BOT_WEBHOOK_PATH: z.string().default('/'),
        }),
    ]),
).parse(
    await loadEnv([
        '',
        'bot-telegram',
        process.env,
    ]),
);
