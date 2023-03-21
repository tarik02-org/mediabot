import { z } from 'zod';

import { createRequestMatcher, createRequestProcessor } from '../../resolvers/lib.ts';

export const processor = createRequestProcessor(
    'instagram',
    z.object({
        key: z.string(),
        link: z.string(),
    }),
    z.object({
        title: z.nullable(z.string()),
        url: z.nullable(z.string()),
        media: z.array(z.union([
            z.object({
                type: z.literal('photo'),
                url: z.string(),
            }),
            z.object({
                type: z.literal('video'),
                url: z.string(),
            }),
        ])),
    }),
    data => data.key,
);

export const matcher = createRequestMatcher(
    /(?:https?:\/\/)?(?:www\.)?(?<link>instagram\.com\/(?<key>stories\/[\w\-.]+\/\d+|reel\/[\w\-.]+|p\/[\w\-.]+))/,
    match => ({
        key: match.groups!.key,
        link: `https://www.${ match.groups!.link }`,
    }),
    processor,
);
