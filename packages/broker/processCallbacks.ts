import { PrismaClient } from '@prisma/client';
import { Logger } from 'pino';
import { z } from 'zod';

import { RedisManager } from '@mediabot/app/redis';

import { Callback } from './Callback';
import { RequestProcessor } from './RequestProcessor';

export const processCallbacks = async function *<TContext, TProcessors extends ReadonlyArray<RequestProcessor<string, any, any>>>(
    {
        prisma,
        redis,
    }: {
        prisma: PrismaClient,
        redis: RedisManager,
    },
    callbackDef: Callback<TContext, TProcessors>,
    {
        log,
        abortSignal,
    }: {
        log?: Logger,
        abortSignal?: AbortSignal,
    } = {},
): AsyncGenerator<{
    [TKey in keyof TProcessors]: {
        name: TProcessors[TKey]['name'],
        context: TContext,
    } & (
        | { result: z.TypeOf<TProcessors[TKey]['resultSchema']> }
        | { error: Error }
    )
}[number], void, void> {
    const queueKey = `${ redis.prefix }callbacks:${ callbackDef.name }`;
    const blockingRedis = redis.client.duplicate();

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
            log?.warn('Invalid item in queue', item);
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
