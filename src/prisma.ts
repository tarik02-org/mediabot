import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

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
