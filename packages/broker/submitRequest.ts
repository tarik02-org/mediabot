import { RedisManager } from '@mediabot/app/redis';
import { PrismaClient } from '@mediabot/prisma';

import { BoundCallback } from './BoundCallback';
import { Callback } from './Callback';
import { RequestProcessor } from './RequestProcessor';

export const submitRequest = async <TProcessor extends RequestProcessor<any, any, any>>(
    {
        prisma,
        redis,
    }: {
        prisma: PrismaClient,
        redis: RedisManager,
    },
    processor: TProcessor,
    query: TProcessor extends RequestProcessor<any, infer TQuery, any> ? TQuery : never,
    callback?: BoundCallback<Callback<any, ReadonlyArray<TProcessor>>>,
    requestExtra?: Omit<Parameters<PrismaClient['request']['create']>[0]['data'], 'query' | 'status'>,
) => {
    const queueKey = `${ redis.prefix }resolvers:${ processor.name }:queue`;

    const request = await prisma.request.create({
        data: {
            ...requestExtra as any,
            query: query as any,
            status: 'PENDING',
        },
    });

    await redis.client.lpush(queueKey, JSON.stringify({
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

    return request;
};
