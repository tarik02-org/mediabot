import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { getEnv } from './env.js';

const env = z.object({
    DATABASE_URL: z.string(),
}).parse(
    getEnv(),
);

export const prisma = new PrismaClient({
    datasources: {
        db: {
            url: env.DATABASE_URL,
        },
    },
});
