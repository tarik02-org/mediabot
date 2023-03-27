import './env';

import { z } from 'zod';

import { PrismaClient } from '../generated/prisma-client/index.js';

const env = z.object({
    DATABASE_URL: z.string(),
}).parse(
    process.env,
);

export const prisma = new PrismaClient({
    datasources: {
        db: {
            url: env.DATABASE_URL,
        },
    },
});
