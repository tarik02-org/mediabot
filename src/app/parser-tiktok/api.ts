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
        /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/t\/(?<hash2>[^/]+)\/?[^\s]*/,
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
            z.object({
                hash2: z.string(),
            }),
        ]).parse(rawMatch.groups);

        if ('author' in match && 'videoId' in match) {
            return {
                key: `tiktok.com/${ match.author }/video/${ match.videoId }`,
                source: `https://tiktok.com/${ match.author }/video/${ match.videoId }`,
            };
        }

        if ('hash' in match) {
            return {
                key: `vm.tiktok.com/${ match.hash }`,
                source: `https://vm.tiktok.com/${ match.hash }`,
            };
        }

        if ('hash2' in match) {
            return {
                key: `tiktok.com/t/${ match.hash2 }`,
                source: `https://tiktok.com/t/${ match.hash2 }`,
            };
        }

        throw new Error();
    },
    processor,
);
