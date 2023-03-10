import '../../env';

import * as uuid from 'uuid';
import { z } from 'zod';

import { log } from '../../log.js';
import { redis, redisPrefix } from '../../redis.js';
import { processRequests } from '../../resolvers/lib.js';

import { processor } from './api.js';
import { downloadFromMusicaldown } from './musicaldown.js';
import { downloadFromTiktok } from './tiktok.js';

export type Query = z.TypeOf<(typeof processor)['querySchema']>;
export type Result = z.TypeOf<(typeof processor)['resultSchema']>;

await processRequests(
    processor,
    async query => {
        const [
            musicaldownResult,
            tiktokResult,
        ] = await Promise.allSettled([
            downloadFromMusicaldown(query),
            downloadFromTiktok(query),
        ]);

        if (musicaldownResult.status === 'rejected') {
            log.error(musicaldownResult.reason, `Download from Musicaldown failed for ${ query.source }`);
        }

        if (tiktokResult.status === 'rejected') {
            log.error(tiktokResult.reason, `Download from Tiktok failed for ${ query.source }`);
        }

        if (musicaldownResult.status === 'fulfilled' && tiktokResult.status === 'fulfilled') {
            const videoId = uuid.v4();
            const videoData = await musicaldownResult.value.downloadVideo();

            await redis.setex(`${ redisPrefix }:tiktok:video:${ videoId }`, 120, videoData);

            return {
                title: tiktokResult.value.title,
                url: musicaldownResult.value.url,
                video: {
                    ref: `tiktok:video:${ videoId }`,
                    width: tiktokResult.value.video.width,
                    height: tiktokResult.value.video.height,
                    duration: tiktokResult.value.video.duration,
                },
            };
        }

        if (musicaldownResult.status === 'fulfilled') {
            const videoId = uuid.v4();
            const videoData = await musicaldownResult.value.downloadVideo();

            await redis.setex(`${ redisPrefix }:tiktok:video:${ videoId }`, 120, videoData);

            return {
                title: musicaldownResult.value.title,
                url: musicaldownResult.value.url,
                video: {
                    ref: `tiktok:video:${ videoId }`,
                },
            };
        }

        if (tiktokResult.status === 'fulfilled') {
            const videoId = uuid.v4();
            const videoData = await tiktokResult.value.downloadVideo();

            await redis.setex(`${ redisPrefix }:tiktok:video:${ videoId }`, 120, videoData);

            return {
                title: tiktokResult.value.title,
                url: tiktokResult.value.url,
                video: {
                    ref: `tiktok:video:${ videoId }`,
                    size: {
                        width: tiktokResult.value.video.width,
                        height: tiktokResult.value.video.height,
                    },
                    duration: tiktokResult.value.video.duration,
                },
            };
        }

        throw new Error(
            `Download from Musicaldown and Tiktok failed for ${ query.source }`,
        );
    },
    {
        concurrency: 4,
        cacheTimeout: 60,
    },
);
