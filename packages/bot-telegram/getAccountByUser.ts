import { User } from 'grammy/types';

import { RedisManager } from '@mediabot/app/redis';
import { PrismaClient } from '@mediabot/prisma';

export const getAccountByUser = async (
    {
        prisma,
        redis,
    }: {
        prisma: PrismaClient,
        redis: RedisManager,
    },
    user: User,
) => await redis.redlock.using(
    [ `${ redis.prefix }telegram:userToAccount:${ user.id }` ],
    30 * 1000,
    async () => {
        return await prisma.telegramAccount.upsert({
            create: {
                telegramId: user.id,
                isBot: user.is_bot,
                firstName: user.first_name,
                lastName: user.last_name,
                username: user.username,
                languageCode: user.language_code,
                isPremium: user.is_premium ?? false,
            },
            update: {
                isBot: user.is_bot,
                firstName: user.first_name,
                lastName: user.last_name,
                username: user.username,
                languageCode: user.language_code,
                isPremium: user.is_premium ?? false,
            },
            where: { telegramId: user.id },
        });
    },
);
