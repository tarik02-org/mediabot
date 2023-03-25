import './env.js';

import { Bot } from 'grammy';
import { z } from 'zod';

const env = z.object({
    BOT_TOKEN: z.string(),
    TELEGRAM_API_ROOT: z.string().optional(),
}).parse(
    process.env,
);

export const telegram = new Bot(
    env.BOT_TOKEN,
    {
        client: {
            apiRoot: env.TELEGRAM_API_ROOT,
        },
    },
);
