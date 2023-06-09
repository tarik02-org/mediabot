import { z } from 'zod';

import { createRequestMatcher, createRequestProcessor } from '@mediabot/broker';

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
    /(?:https?:\/\/)?(?:www\.)?(?<link>instagram\.com\/(?<key>stories\/[\w\-.]+\/\d+|reel\/[\w\-.]+|p\/[\w\-.]+))/,
    match => ({
        key: match.groups!.key,
        link: `https://www.${ match.groups!.link }`,
    }),
    processor,
);
