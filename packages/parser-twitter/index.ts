import { HTTPError } from 'got';
import * as radash from 'radash';
import { z } from 'zod';

import { processRequests } from '@mediabot/broker/processRequests';

import { processor } from './api';
import { env, log, prisma, redis } from './deps';
import { getGuestToken } from './getGuestToken';
import { getStatus } from './getStatus';

export type Query = z.TypeOf<(typeof processor)['querySchema']>;
export type Result = z.TypeOf<(typeof processor)['resultSchema']>;

const authToken = env.AUTH_TOKEN;

export const main = async (process: NodeJS.Process, abortSignal: AbortSignal) => await radash.defer(async defer => {
    let guestToken = await getGuestToken(authToken);
    log.debug({ guestToken }, 'Got guest token');

    await processRequests(
        {
            redis,
            prisma,
            log,
        },
        processor,
        async query => {
            const chain = [];
            let status;

            try {
                status = await getStatus(query.id, {
                    authToken,
                    guestToken,
                });

                let current: any = status;
                while (current.in_reply_to_status_id_str !== null) {
                    current = await getStatus(current.in_reply_to_status_id_str, {
                        authToken,
                        guestToken,
                    });
                    chain.unshift(current);
                }
            } catch (e: any) {
                if (e instanceof HTTPError && [ 401, 403 ].includes(e.response.statusCode)) {
                    log.info(`Got ${ e.response.statusCode } from Twitter, refreshing guest token`);
                    guestToken = await getGuestToken(authToken);
                    log.debug({ guestToken }, 'Got guest token');

                    status = await getStatus(query.id, {
                        authToken,
                        guestToken,
                    });
                } else {
                    throw e;
                }
            }

            return {
                chain,
                status,
            };
        },
        {
            abortSignal,
            concurrency: 4,
            cacheTimeout: 60,
        },
    );

    return 0;
});
