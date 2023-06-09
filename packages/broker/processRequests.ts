import { PrismaClient } from '@prisma/client';
import PQueue from 'p-queue';
import { Logger } from 'pino';

import { RedisManager } from '@mediabot/app/redis';

import { RequestProcessor } from './RequestProcessor';
import { RetryRequestError } from './RetryRequestError';

export const processRequests = async <TQuery, TResult>(
    {
        prisma,
        redis,
        log,
    }: {
        prisma: PrismaClient,
        redis: RedisManager,
        log?: Logger,
    },
    processor: RequestProcessor<any, TQuery, TResult>,
    callback: (data: TQuery) => Promise<TResult>,
    {
        concurrency = 1,
        lockTimeout = 30 * 1000,
        cacheTimeout = 60,
        abortSignal,
    }: {
        concurrency?: number,
        lockTimeout?: number,
        cacheTimeout?: number,
        abortSignal?: AbortSignal,
    } = {},
) => {
    const queueKey = `${ redis.prefix }resolvers:${ processor.name }:queue`;
    const blockingRedis = redis.client.duplicate();
    const jobQueue = new PQueue({
        concurrency,
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
        await jobQueue.onIdle();

        if (abortSignal !== undefined && abortSignal.aborted) {
            break;
        }

        const rawItem = await blockingRedis.brpop(queueKey, 1);
        if (rawItem === null) {
            continue;
        }

        log?.debug('Got job from queue. Processing...', rawItem);

        jobQueue.add(async () => {
            const item = JSON.parse(rawItem[ 1 ]);
            if (!(
                typeof item === 'object' &&
                item !== null &&
                'requestId' in item &&
                typeof item.requestId === 'number'
            )) {
                log?.warn('Invalid item in queue', item);
                return;
            }

            try {
                const request = await prisma.request.update({
                    where: { id: item.requestId },
                    data: {
                        status: 'PROCESSING',
                    },
                });

                const query = processor.querySchema.parse(request.query);
                const key = processor.createKey(query);

                const result = await redis.redlock.using(
                    [ `${ redis.prefix }resolvers:${ processor.name }:lock:${ key }` ],
                    lockTimeout,
                    async () => {
                        const cacheKey = `${ redis.prefix }resolvers:${ processor.name }:result-cache:${ key }`;
                        const cachedIdRaw = await redis.client.get(cacheKey);
                        if (cachedIdRaw !== null) {
                            const cachedId = JSON.parse(cachedIdRaw);
                            if (typeof cachedId === 'number') {
                                const result = await prisma.requestResult.findUnique({
                                    where: { id: cachedId },
                                });
                                if (result !== null) {
                                    return result;
                                }
                            }
                        }

                        const data = await callback(query);

                        const requestResult = await prisma.requestResult.create({
                            data: {
                                payload: data as any,
                            },
                        });

                        redis.client.setex(cacheKey, cacheTimeout, JSON.stringify(requestResult.id));
                        return requestResult;
                    },
                );

                await prisma.request.update({
                    where: { id: item.requestId },
                    data: {
                        status: 'SUCCESS',
                        resultId: result.id,
                    },
                });
            } catch (e: any) {
                if (e instanceof RetryRequestError) {
                    await prisma.request.update({
                        where: { id: item.requestId },
                        data: {
                            status: 'PENDING',
                        },
                    });

                    await redis.client.lpush(queueKey, rawItem[ 1 ]);
                    return;
                }

                await prisma.request.update({
                    where: { id: item.requestId },
                    data: {
                        status: 'FAILED',
                    },
                });

                log?.error(e, 'Error while processing queue item: %s', rawItem[ 1 ]);
            }

            if (
                'callback' in item &&
                typeof item.callback === 'object' &&
                item.callback !== null &&
                'name' in item.callback &&
                typeof item.callback.name === 'string' &&
                'data' in item.callback
            ) {
                await redis.client.lpush(
                    `${ redis.prefix }callbacks:${ item.callback.name }`,
                    JSON.stringify(item.callback.data),
                );
            }
        });
    }

    await jobQueue.onEmpty();
};
