import { z } from 'zod';

import { createRequestMatcher, createRequestProcessor } from '../../resolvers/lib.js';

const dataSchema = z.union([
    z.object({
        type: z.literal('url'),
        url: z.string(),
    }),
    z.object({
        type: z.literal('ref'),
        ref: z.string(),
        name: z.string(),
    }),
]);

export const processor = createRequestProcessor(
    'tiktok',
    z.object({
        key: z.string(),
        source: z.string(),
    }),
    z.object({
        title: z.string(),
        url: z.string(),

        media: z.union([
            z.object({
                type: z.literal('photos'),
                items: z.array(z.object({
                    data: dataSchema,
                    size: z.optional(z.object({
                        width: z.number(),
                        height: z.number(),
                    })),
                })),
            }),
            z.object({
                type: z.literal('video'),
                data: dataSchema,
                size: z.optional(z.object({
                    width: z.number(),
                    height: z.number(),
                })),
                duration: z.optional(z.number()),
            }),
        ]),
    }),
    data => data.key,
);

export const matcher = createRequestMatcher(
    [
        /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/(?<author>@[^/]+)\/video\/(?<videoId>[0-9]+)\/?[^\s]*/,
        /(?:https?:\/\/)?(?:www\.)?vm\.tiktok\.com\/(?<hash>[^/]+)\/?[^\s]*/,
    ],
    rawMatch => {
        const match = z.union([
            z.object({
                author: z.string(),
                videoId: z.string(),
            }),
            z.object({
                hash: z.string(),
            }),
        ]).parse(rawMatch.groups);

        if ('author' in match && 'videoId' in match) {
            return {
                key: `${ match.author }/${ match.videoId }`,
                source: `https://tiktok.com/${ match.author }/video/${ match.videoId }`,
            };
        }

        if ('hash' in match) {
            return {
                key: match.hash,
                source: `https://vm.tiktok.com/${ match.hash }`,
            };
        }

        throw new Error();
    },
    processor,
);
