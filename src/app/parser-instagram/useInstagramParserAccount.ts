import * as Sentry from '@sentry/core';
import { DateTime } from 'luxon';

import { InstagramParserAccount } from '../../../generated/prisma-client/index.js';
import { log } from '../../log.js';
import { prisma } from '../../prisma.js';

export const useInstagramParserAccount = async ({
    signal,
    updateInterval = 5000,
}: {
    signal: AbortSignal,
    updateInterval?: number
}) => {
    let account: InstagramParserAccount | null = null;

    while (account === null) {
        account = await prisma.instagramParserAccount.findFirst({
            where: {
                AND: [
                    {
                        isActive: true,
                    },
                    {
                        OR: [
                            {
                                lastUsedAt: null,
                            },
                            {
                                lastUsedAt: {
                                    lt: DateTime.now().minus({ minutes: 1 }).toJSDate(),
                                },
                            },
                        ],
                    },
                ],
            },
        });

        if (account === null || signal.aborted) {
            return null;
        }

        const updateResult = await prisma.instagramParserAccount.updateMany({
            where: {
                AND: [
                    {
                        id: account.id,
                        isActive: true,
                    },
                    {
                        OR: [
                            {
                                lastUsedAt: null,
                            },
                            {
                                lastUsedAt: {
                                    lt: DateTime.now().minus({ minutes: 1 }).toJSDate(),
                                },
                            },
                        ],
                    },
                ],
            },
            data: {
                lastUsedAt: DateTime.now().toJSDate(),
            },
        });

        if (updateResult.count !== 1) {
            account = null;
        }
    }

    if (signal.aborted) {
        return null;
    }

    const intervalHandle = setInterval(async () => {
        try {
            await prisma.instagramParserAccount.update({
                where: {
                    id: account!.id,
                },
                data: {
                    lastUsedAt: DateTime.now().toJSDate(),
                },
            });
        } catch (e) {
            log.error(e);
            Sentry.captureException(e);
        }
    }, updateInterval);

    signal.addEventListener('abort', () => {
        clearInterval(intervalHandle);
    });

    return account;
};
