import { Bot } from 'grammy';
import { z } from 'zod';

export const telegram = new Bot(
    z.object({
        BOT_TOKEN: z.string(),
    }).parse(
        process.env,
    ).BOT_TOKEN,
);
