import lodash from 'lodash';
import * as nodePath from 'node:path';
import { Browser } from 'puppeteer';
import * as radash from 'radash';
import * as uuid from 'uuid';
import { z } from 'zod';
import got from 'got';

import { processRequests } from '@mediabot/broker/processRequests';
import { RetryRequestError } from '@mediabot/broker/RetryRequestError';

import { processor, mediaSchema } from './api';
import { env, log, prisma, redis } from './deps';

export type Query = z.TypeOf<(typeof processor)['querySchema']>;
export type Result = z.TypeOf<(typeof processor)['resultSchema']>;

export const main = async (process: NodeJS.Process, abortSignal: AbortSignal) => await radash.defer(async defer => {
    const api = got.extend({
        prefixUrl: env.INSTAGRAM_UAPI_URL,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
    });

    const computeForLink = async (link: string) => radash.defer(async defer => {
        const { body } = await api.post('api/v1/scrape', {
            responseType: 'json',
            body: JSON.stringify({
                url: link,
            }),
        });

        const parsedBody = z.object({
            data: z.discriminatedUnion('status', [
                z.object({
                    status: z.literal('success'),
                    page: z.object({
                        title: z.string().optional(),
                        url: z.string().optional(),
                        media: mediaSchema.array(),
                    }),
                }),
                z.object({
                    status: z.literal('error'),
                    error: z.string(),
                }),
            ]),
            meta: z.object({
                requestId: z.string(),
            }),
        }).parse(body);

        log.trace({ parsedBody });

        if (parsedBody.data.status !== 'success') {
            throw new Error(parsedBody.data.error);
        }

        const { page } = parsedBody.data;

        if (page.media.length === 0) {
            throw new Error('No media found');
        }

        return page;
    });

    await processRequests(
        {
            prisma,
            redis,
            log,
        },
        processor,
        async ({ link }) => {
            if (abortSignal.aborted) {
                throw new RetryRequestError();
            }
            return await computeForLink(link);
        },
        {
            abortSignal,
            concurrency: 1,
        },
    );

    return 0;
});
