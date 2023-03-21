import { z } from 'zod';

import { createRequestProcessor } from '../../resolvers/lib.ts';

export const processor = createRequestProcessor(
    'render',
    z.object({
        content: z.string(),
        selector: z.optional(z.string()),
        viewport: z.optional(z.object({
            width: z.optional(z.number()),
            height: z.optional(z.number()),
            deviceScaleFactor: z.optional(z.number()),
        })),
    }),
    z.object({
        ref: z.string(),
        width: z.number(),
        height: z.number(),
    }),
    data => JSON.stringify(data),
);
