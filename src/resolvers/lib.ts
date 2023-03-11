import PQueue from 'p-queue';
import { z } from 'zod';

import { log } from '../log.js';
import { prisma } from '../prisma.js';
import { connectRedis, redis, redisPrefix, redlock } from '../redis.js';

export type RequestProcessor<TName extends string, TQuery, TResult> = {
    name: TName,
    querySchema: z.Schema<TQuery>,
    resultSchema: z.Schema<TResult>,
    createKey: (data: TQuery) => string
};

export type Callback<TContext, TProcessors extends ReadonlyArray<RequestProcessor<string, any, any>>> = {
    name: string,
    context: z.Schema<TContext>,
    processors: TProcessors
};

export type BoundCallback<TCallback extends Callback<any, any>> = {
    context: z.TypeOf<TCallback['context']>,
    callback: TCallback
};

export const createRequestProcessor = <TName extends string, TQuery, TResult>(
    name: TName,
    querySchema: z.Schema<TQuery>,
    resultSchema: z.Schema<TResult>,
    createKey: (data: TQuery) => string,
): RequestProcessor<TName, TQuery, TResult> => {
    return {
        name,
        querySchema,
        resultSchema,
        createKey,
    };
};

export const createRequestMatcher = <TQuery>(
    regex: RegExp | RegExp[],
    prepareQuery: (match: RegExpMatchArray) => TQuery,
    processor: RequestProcessor<string, TQuery, any>,
) => {
    return {
        regex: regex instanceof Array ? regex : [ regex ],
        prepareQuery,
        processor,
    };
};

export const submitRequest = async <TProcessor extends RequestProcessor<any, any, any>>(
    processor: TProcessor,
    query: TProcessor extends RequestProcessor<any, infer TQuery, any> ? TQuery : never,
    callback?: BoundCallback<Callback<any, ReadonlyArray<TProcessor>>>,
    requestExtra?: Omit<Parameters<typeof prisma['request']['create']>[0]['data'], 'query' | 'status'>,
) => {
    const queueKey = `${ redisPrefix }resolvers:${ processor.name }:queue`;

    const request = await prisma.request.create({
        data: {
            ...requestExtra as any,
            query: query as any,
            status: 'PENDING',
        },
    });

    await redis.lpush(queueKey, JSON.stringify({
        requestId: request.id,
        callback: callback !== undefined
            ?
            {
                name: callback.callback.name,
                data: {
                    id: request.id,
                    name: processor.name,
                    context: callback.context,
                },
            }
            : undefined,
    }));
};

export const processRequests = async <TQuery, TResult>(
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
        abortSignal?: AbortSignal
    } = {},
) => {
    const blockingRedis = connectRedis();
    const queueKey = `${ redisPrefix }resolvers:${ processor.name }:queue`;
    const jobQueue = new PQueue({
        concurrency,
    });

    while (abortSignal === undefined || abortSignal.aborted === false) {
        await jobQueue.onIdle();

        const rawItem = await blockingRedis.brpop(queueKey, 1);
        if (rawItem === null) {
            continue;
        }

        log.debug('Got job from queue. Processing...', rawItem);

        jobQueue.add(async () => {
            const item = JSON.parse(rawItem[ 1 ]);
            if (!(
                typeof item === 'object' &&
                item !== null &&
                'requestId' in item &&
                typeof item.requestId === 'number'
            )) {
                log.warn('Invalid item in queue', item);
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

                const result = await redlock.using(
                    [ `${ redisPrefix }resolvers:${ processor.name }:lock:${ key }` ],
                    lockTimeout,
                    async () => {
                        const cacheKey = `${ redisPrefix }resolvers:${ processor.name }:result-cache:${ key }`;
                        const cachedIdRaw = await redis.get(cacheKey);
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

                        redis.setex(cacheKey, cacheTimeout, JSON.stringify(requestResult.id));
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
                await prisma.request.update({
                    where: { id: item.requestId },
                    data: {
                        status: 'FAILED',
                    },
                });

                log.error(e, 'Error while processing queue item: %s', rawItem[ 1 ]);
            }

            if (
                'callback' in item &&
                typeof item.callback === 'object' &&
                item.callback !== null &&
                'name' in item.callback &&
                typeof item.callback.name === 'string' &&
                'data' in item.callback
            ) {
                await redis.lpush(
                    `${ redisPrefix }callbacks:${ item.callback.name }`,
                    JSON.stringify(item.callback.data),
                );
            }
        });
    }
};

export const createCallback = <TContext, TProcessors extends ReadonlyArray<RequestProcessor<string, any, any>>>(
    name: string,
    context: z.Schema<TContext>,
    processors: TProcessors,
): Callback<TContext, TProcessors> => {
    return {
        name,
        context,
        processors,
    };
};

export const processCallbacks = async function *<TContext, TProcessors extends ReadonlyArray<RequestProcessor<string, any, any>>>(
    callbackDef: Callback<TContext, TProcessors>,
    {
        abortSignal,
    }: {
        abortSignal?: AbortSignal
    } = {},
): AsyncGenerator<{
    [TKey in keyof TProcessors]: {
        name: TProcessors[TKey]['name'],
        context: TContext
    } & (
        | { result: z.TypeOf<TProcessors[TKey]['resultSchema']> }
        | { error: Error }
    )
}[number], void, void> {
    const blockingRedis = connectRedis();
    const queueKey = `${ redisPrefix }callbacks:${ callbackDef.name }`;

    const processorsMap = new Map(callbackDef.processors.map(processor => [ processor.name, processor ]));

    while (abortSignal === undefined || abortSignal.aborted === false) {
        const rawItem = await blockingRedis.brpop(queueKey, 1);
        if (rawItem === null) {
            continue;
        }

        const item = JSON.parse(rawItem[ 1 ]);
        if (!(
            typeof item === 'object' &&
            item !== null &&
            'id' in item &&
            typeof item.id === 'number' &&
            'name' in item &&
            typeof item.name === 'string' &&
            'context' in item
        )) {
            log.warn('Invalid item in queue', item);
            continue;
        }

        const id = item.id;
        const name = item.name;
        const context = callbackDef.context.parse(item.context);

        try {
            const request = await prisma.request.findUniqueOrThrow({
                where: { id },
                include: { result: true },
            });

            const processor = processorsMap.get(name);
            if (processor === undefined) {
                throw new Error('Unknown processor');
            }

            if (request.result === null) {
                throw new Error('No result found');
            }

            const result = processor.resultSchema.parse(request.result.payload);

            yield { name, context, result };
        } catch (error: any) {
            yield { name, context, error };
        }
    }
};

export const bindCallback = <TCallback extends Callback<any, any>>(callback: TCallback, context: z.TypeOf<TCallback['context']>): BoundCallback<TCallback> => {
    return {
        context,
        callback,
    };
};
