import { PrismaClient } from '@mediabot/prisma';

export const createPrismaClient = (url: string) => new PrismaClient({
    datasources: {
        db: {
            url,
        },
    },
});
