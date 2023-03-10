import { Bot } from 'grammy';
import { z } from 'zod';
import { getEnv } from './env.js';

export const telegram = new Bot(
    z.object({
        BOT_TOKEN: z.string()
    }).parse(
        getEnv()
    ).BOT_TOKEN
);
