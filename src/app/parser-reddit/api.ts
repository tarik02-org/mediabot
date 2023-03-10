import { z } from 'zod';

import { createRequestMatcher, createRequestProcessor } from '../../resolvers/lib.js';

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
                url: z.string(),
                size: z.optional(z.object({
                    width: z.number(),
                    height: z.number(),
                })),
            }),
            z.object({
                type: z.literal('video'),
                url: z.string(),
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
