import * as Sentry from '@sentry/core';
import * as radash from 'radash';
import * as uuid from 'uuid';
import { z } from 'zod';

import { processRequests } from '@mediabot/broker/processRequests';

import { processor } from './api';
import { log, prisma, redis } from './deps';
import { downloadFromMusicaldown } from './musicaldown';
import { downloadFromTiktok } from './tiktok';

export type Query = z.TypeOf<(typeof processor)['querySchema']>;
export type Result = z.TypeOf<(typeof processor)['resultSchema']>;

export const main = async (process: NodeJS.Process, abortSignal: AbortSignal) => await radash.defer(async defer => {
    await processRequests(
        {
            redis,
            prisma,
            log,
        },
        processor,
        async (query): Promise<Result> => {
            const [
                musicaldownResult,
                tiktokResult,
            ] = await Promise.allSettled([
                downloadFromMusicaldown(query),
                downloadFromTiktok(query),
            ]);

            if (musicaldownResult.status === 'rejected') {
                log.error(musicaldownResult.reason, `Download from Musicaldown failed for ${ query.source }`);
                Sentry.captureException(musicaldownResult.reason);
            }

            if (tiktokResult.status === 'rejected') {
                log.error(tiktokResult.reason, `Download from Tiktok failed for ${ query.source }`);
                Sentry.captureException(tiktokResult.reason);
            }

            if (
                musicaldownResult.status === 'fulfilled' &&
                musicaldownResult.value !== null &&
                tiktokResult.status === 'fulfilled'
            ) {
                const ref = `tiktok:video:${ uuid.v4() }`;
                const videoData = await musicaldownResult.value.downloadVideo();

                await redis.client.setex(`${ redis.prefix }:${ ref }`, 120, videoData);

                return {
                    title: tiktokResult.value.title,
                    url: musicaldownResult.value.url,
                    media: {
                        type: 'video',
                        data: {
                            type: 'ref',
                            ref,
                            name: 'video.mp4',
                        },
                        ...tiktokResult.value.type === 'video'
                            ? {
                                size: {
                                    width: tiktokResult.value.video.width,
                                    height: tiktokResult.value.video.height,
                                },
                                duration: tiktokResult.value.video.duration,
                            }
                            : {},
                    },
                };
            }

            if (
                musicaldownResult.status === 'fulfilled' &&
                musicaldownResult.value !== null
            ) {
                const ref = `tiktok:video:${ uuid.v4() }`;
                const videoData = await musicaldownResult.value.downloadVideo();

                await redis.client.setex(`${ redis.prefix }:${ ref }`, 120, videoData);

                return {
                    title: musicaldownResult.value.title,
                    url: musicaldownResult.value.url,
                    media: {
                        type: 'video',
                        data: {
                            type: 'ref',
                            ref,
                            name: 'video.mp4',
                        },
                    },
                };
            }

            if (tiktokResult.status === 'fulfilled') {
                switch (tiktokResult.value.type) {
                    case 'images': {
                        return {
                            title: tiktokResult.value.title,
                            url: tiktokResult.value.url,
                            media: {
                                type: 'photos',
                                items: await Promise.all(tiktokResult.value.images.map(async image => {
                                    const data = await image.download();
                                    const ref = `tiktok:image:${ uuid.v4() }`;

                                    await redis.client.setex(`${ redis.prefix }:${ ref }`, 120, data);

                                    return {
                                        data: {
                                            type: 'ref',
                                            ref,
                                            name: 'image.jpeg',
                                        },
                                        size: {
                                            width: image.width,
                                            height: image.height,
                                        },
                                    };
                                })),
                            },
                        };
                    }

                    case 'video': {
                        const ref = `tiktok:video:${ uuid.v4() }`;
                        const videoData = await tiktokResult.value.downloadVideo();

                        await redis.client.setex(`${ redis.prefix }:${ ref }`, 120, videoData);

                        return {
                            title: tiktokResult.value.title,
                            url: tiktokResult.value.url,
                            media: {
                                type: 'video',
                                data: {
                                    type: 'ref',
                                    ref,
                                    name: 'video.mp4',
                                },
                                size: {
                                    width: tiktokResult.value.video.width,
                                    height: tiktokResult.value.video.height,
                                },
                                duration: tiktokResult.value.video.duration,
                            },
                        };
                    }
                }
            }

            throw new Error(
                `Download from Musicaldown and Tiktok failed for ${ query.source }`,
            );
        },
        {
            abortSignal,
            concurrency: 4,
            cacheTimeout: 60,
        },
    );

    return 0;
});
