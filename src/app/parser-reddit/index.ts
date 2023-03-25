import '../../env.js';

import ffmpeg from 'fluent-ffmpeg';
import Got from 'got';
import lodash from 'lodash';
import { WritableStreamBuffer } from 'stream-buffers';
import * as uuid from 'uuid';
import { z } from 'zod';

import { log } from '../../log.js';
import { redis, redisPrefix } from '../../redis.js';
import { processRequests } from '../../resolvers/lib.js';

import { processor } from './api.js';

type Result = z.TypeOf<(typeof processor)['resultSchema']>;

const got = Got.extend({
    headers: {
        Accept: 'application/json',
    },
});

const downloadVideoWithFfmpeg = async (url: string): Promise<Buffer> => await new Promise<Buffer>((resolve, reject) => {
    const outputStream = new WritableStreamBuffer({
        initialSize: 1024 * 1024,
        incrementAmount: 1024 * 1024,
    });

    ffmpeg(url)
        .withOptions([
            '-c', 'copy',
            '-movflags', 'faststart+frag_keyframe+empty_moov',
        ])
        .outputFormat('mp4')
        .on('error', (err, stdout, stderr) => {
            log.debug({
                err,
                stdout,
                stderr,
            }, 'Failed to convert video');

            reject(err);
        })
        .on('end', (stdout, stderr) => {
            log.debug({
                stdout,
                stderr,
            }, 'Converted video');

            const contents = outputStream.getContents();
            if (contents === false) {
                reject(new Error('Failed to get contents'));
            } else {
                resolve(contents);
            }
        })
        .pipe(outputStream, { end: true });
});

const computeForLink = async (link: string): Promise<Result> => {
    const data = await got.get(link, {
        searchParams: {
            raw_json: '1',
        },
    }).json();

    const rawPostData = lodash.get(data, '0.data.children.0.data', null);

    const commonPostData = z.object({
        title: z.string(),
        permalink: z.string(),
        over_18: z.boolean(),
    }).parse(
        rawPostData,
    );

    const title = commonPostData.title;
    const url = `https://www.reddit.com${ commonPostData.permalink }`;

    {
        const parsedPostData = z.object({
            media: z.object({
                reddit_video: z.object({
                    dash_url: z.string(),
                    width: z.number(),
                    height: z.number(),
                    duration: z.number(),
                }),
            }),
        }).safeParse(
            rawPostData,
        );

        if (parsedPostData.success) {
            const postData = parsedPostData.data;

            const contents = await downloadVideoWithFfmpeg(
                postData.media.reddit_video.dash_url,
            );

            const ref = `reddit:video:${ uuid.v4() }`;
            await redis.setex(
                `${ redisPrefix }:${ ref }`, 120,
                contents,
            );

            return {
                title,
                url,
                media: [
                    {
                        type: 'video',
                        data: {
                            type: 'ref',
                            ref,
                            name: 'video.mp4',
                        },
                        duration: postData.media.reddit_video.duration,
                        size: {
                            width: postData.media.reddit_video.width,
                            height: postData.media.reddit_video.height,
                        },
                    },
                ],
            };
        }
    }

    {
        const parsedPostData = z.object({
            media_metadata: z.record(
                z.string(),
                z.union([
                    z.object({
                        e: z.literal('Image'),
                        s: z.object({
                            u: z.string(),
                            x: z.number(),
                            y: z.number(),
                        }),
                        m: z.string(),
                    }),
                    z.object({
                        e: z.literal('AnimatedImage'),
                        s: z.intersection(
                            z.union([
                                z.object({
                                    mp4: z.string(),
                                }),
                                z.object({
                                    gif: z.string(),
                                }),
                                z.object({
                                    u: z.string(),
                                }),
                            ]),
                            z.object({
                                x: z.number(),
                                y: z.number(),
                            }),
                        ),
                        m: z.string(),
                    }),
                ]),
            ),
            gallery_data: z.object({
                items: z.array(
                    z.object({
                        media_id: z.string(),
                    }),
                ),
            }),
        }).safeParse(
            rawPostData,
        );

        if (parsedPostData.success) {
            const postData = parsedPostData.data;

            return {
                title,
                url,

                media: postData.gallery_data.items.map((item): Result['media'][number] => {
                    const metadata = postData.media_metadata[ item.media_id ];

                    switch (metadata.e) {
                        case 'Image':
                            return {
                                type: 'photo',
                                data: {
                                    type: 'url',
                                    url: metadata.s.u,
                                },
                                size: {
                                    width: metadata.s.x,
                                    height: metadata.s.y,
                                },
                            };

                        case 'AnimatedImage':
                            if ('mp4' in metadata.s) {
                                return {
                                    type: 'video',
                                    data: {
                                        type: 'url',
                                        url: metadata.s.mp4,
                                    },
                                    size: {
                                        width: metadata.s.x,
                                        height: metadata.s.y,
                                    },
                                };
                            } else {
                                return {
                                    type: 'photo',
                                    data: {
                                        type: 'url',
                                        url: 'u' in metadata.s ? metadata.s.u : metadata.s.gif,
                                    },
                                    size: {
                                        width: metadata.s.x,
                                        height: metadata.s.y,
                                    },
                                };
                            }
                    }
                }),
            };
        }
    }

    {
        const parsedPostData = z.object({
            is_reddit_media_domain: z.literal(true),
            is_video: z.literal(false),
            url: z.string(),
        }).safeParse(
            rawPostData,
        );

        if (parsedPostData.success) {
            const postData = parsedPostData.data;

            return {
                title,
                url,
                media: [
                    {
                        type: postData.url.match(/\.gif/i)
                            ? 'gif'
                            : 'photo',
                        data: {
                            type: 'url',
                            url: postData.url,
                        },
                    },
                ],
            };
        }
    }

    {
        const parsedPostData = z.object({
            preview: z.object({
                reddit_video_preview: z.object({
                    dash_url: z.string(),
                    width: z.number(),
                    height: z.number(),
                    duration: z.number(),
                }),
            }),
        }).safeParse(
            rawPostData,
        );

        if (parsedPostData.success) {
            const postData = parsedPostData.data;

            const contents = await downloadVideoWithFfmpeg(
                postData.preview.reddit_video_preview.dash_url,
            );

            const ref = `reddit:video:${ uuid.v4() }`;
            await redis.setex(
                `${ redisPrefix }:${ ref }`, 120,
                contents,
            );

            return {
                title,
                url,
                media: [
                    {
                        type: 'video',
                        data: {
                            type: 'ref',
                            ref,
                            name: 'video.mp4',
                        },
                        duration: postData.preview.reddit_video_preview.duration,
                        size: {
                            width: postData.preview.reddit_video_preview.width,
                            height: postData.preview.reddit_video_preview.height,
                        },
                    },
                ],
            };
        }
    }

    throw new Error('Unhandled post type');
};

await processRequests(
    processor,
    ({ link }) => computeForLink(link),
    {
        cacheTimeout: 60,
        concurrency: 10,
    },
);
