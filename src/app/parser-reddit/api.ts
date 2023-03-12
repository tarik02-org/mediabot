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
    'reddit',
    z.object({
        key: z.string(),
        link: z.string(),
    }),
    z.object({
        title: z.string(),
        url: z.string(),
        media: z.array(z.union([
            z.object({
                type: z.literal('photo'),
                data: dataSchema,
                size: z.optional(z.object({
                    width: z.number(),
                    height: z.number(),
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
        ])),
    }),
    data => data.key,
);

export const matcher = createRequestMatcher(
    /(?:https?:\/\/)?(?:www\.)?reddit\.com\/+(?<path>(r|user)\/([^/]+)\/comments\/([^/]+)\/([^/\s?]+))\/?(\?[a-zA-Z0-9_&=]+)?/,
    match => ({
        key: match.groups!.path,
        link: `https://www.reddit.com/${ match.groups!.path }.json`,
    }),
    processor,
);
