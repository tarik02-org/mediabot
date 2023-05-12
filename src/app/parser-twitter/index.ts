import '../../env.js';

import { HTTPError } from 'got';
import * as radash from 'radash';
import { z } from 'zod';

import { log } from '../../log.js';
import { processRequests } from '../../resolvers/lib.js';
import { useSignalHandler } from '../../utils/signalHandler.js';

import { processor } from './api.js';
import { getGuestToken } from './getGuestToken.js';
import { getStatus } from './getStatus.js';

export type Query = z.TypeOf<(typeof processor)['querySchema']>;
export type Result = z.TypeOf<(typeof processor)['resultSchema']>;

const {
    AUTH_TOKEN: authToken,
} = z.object({
    AUTH_TOKEN: z.string(),
}).parse(
    process.env,
);

await radash.defer(async defer => {
    const abortController = new AbortController();
    defer(() => abortController.abort());

    defer(
        useSignalHandler(() => abortController.abort()),
    );

    let guestToken = await getGuestToken(authToken);
    log.debug({ guestToken }, 'Got guest token');

    await processRequests(
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
            abortSignal: abortController.signal,
            concurrency: 4,
            cacheTimeout: 2,
        },
    );
});
