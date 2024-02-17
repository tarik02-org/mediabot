import { z } from 'zod';

import { createRequestMatcher, createRequestProcessor } from '@mediabot/broker';

export const mediaSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('photo'),
        url: z.string(),
        dimensions: z.object({
            width: z.number(),
            height: z.number(),
        }).optional(),
    }),
    z.object({
        type: z.literal('video'),
        url: z.string(),
        dimensions: z.object({
            width: z.number(),
            height: z.number(),
        }).optional(),
        duration: z.number().nullable(),
    }),
]);

export const processor = createRequestProcessor(
    'instagram',
    z.object({
        key: z.string(),
        link: z.string(),
    }),
    z.object({
        title: z.string().optional(),
        url: z.string().optional(),
        media: mediaSchema.array(),
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
