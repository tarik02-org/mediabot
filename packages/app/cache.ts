import { Logger } from 'pino';
import { z } from 'zod';

import { PrismaClient } from '@mediabot/prisma';

import { RedisManager } from './redis';

export type Cache = {
    get: <T>(key: string, ttl: number, schema: z.Schema<T>, callback: () => Promise<T>) => Promise<T>,
};

export const createCache = ({
    prisma,
    redis,
    log,
}: {
    prisma: PrismaClient,
    redis: RedisManager,
    log?: Logger,
}): Cache => ({
    get: async <T>(
        key: string,
        ttl: number,
        schema: z.Schema<T>,
        callback: () => Promise<T>,
    ) => {
        const cachedValue = await prisma.cache.findUnique({
            where: { key },
        });

        if (cachedValue !== null && cachedValue.expiresAt > new Date()) {
            try {
                return schema.parse(cachedValue.value);
            } catch (e) {
                log?.warn(e, `Cache value for key "${ key }" is invalid`);
            }
        }

        return redis.redlock.using([ `${ redis.prefix }:cache:${ key }` ], 10000, async () => {
            const cachedValue = await prisma.cache.findUnique({
                where: { key },
            });

            if (cachedValue !== null && cachedValue.expiresAt > new Date()) {
                return schema.parse(cachedValue.value);
            }

            const value = await callback();

            await prisma.cache.upsert({
                where: { key },
                update: {
                    value: value as any,
                    expiresAt: new Date(Date.now() + ttl),
                },
                create: {
                    key,
                    value: value as any,
                    expiresAt: new Date(Date.now() + ttl),
                },
            });

            return value;
        });
    },
});
