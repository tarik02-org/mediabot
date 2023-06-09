import { z } from 'zod';

import { createRequestMatcher, createRequestProcessor } from '@mediabot/broker';

export const processor = createRequestProcessor(
    'twitter',
    z.object({
        key: z.string(),
        user: z.string(),
        id: z.string(),
    }),
    z.object({
        chain: z.array(z.any()),
        status: z.any(),
    }),
    data => data.key,
);

export const matcher = createRequestMatcher(
    [
        /(?:https?:\/\/)?(?:www\.)?twitter\.com\/(?<user>[^/]+)\/status\/(?<id>\d+)/,
    ],
    rawMatch => {
        const match = z.object({
            user: z.string(),
            id: z.string(),
        }).parse(rawMatch.groups);

        return {
            key: `${ match.user }/${ match.id }`,
            ...match,
        };
    },
    processor,
);
