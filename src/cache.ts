import { z } from 'zod';

import { log } from './log.ts';
import { prisma } from './prisma.ts';
import { redisPrefix, redlock } from './redis.ts';

export const cache = {
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
                log.warn(e, `Cache value for key "${ key }" is invalid`);
            }
        }

        return redlock.using([ `${ redisPrefix }:cache:${ key }` ], 10000, async () => {
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
};
