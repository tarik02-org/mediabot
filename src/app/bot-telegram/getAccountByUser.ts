import { User } from "grammy/types";
import { prisma } from "../../prisma.js";
import { redisPrefix, redlock } from "../../redis.js";

export const getAccountByUser = async (user: User) => await redlock.using(
    [ `${ redisPrefix }telegram:userToAccount:${ user.id }` ],
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
                isPremium: user.is_premium ?? false
            },
            update: {
                isBot: user.is_bot,
                firstName: user.first_name,
                lastName: user.last_name,
                username: user.username,
                languageCode: user.language_code,
                isPremium: user.is_premium ?? false
            },
            where: { telegramId: user.id }
        });
    }
);
