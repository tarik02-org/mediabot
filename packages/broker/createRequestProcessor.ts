import { z } from 'zod';

import { RequestProcessor } from './RequestProcessor';

export const createRequestProcessor = <TName extends string, TQuery, TResult>(
    name: TName,
    querySchema: z.Schema<TQuery>,
    resultSchema: z.Schema<TResult>,
    createKey: (data: TQuery) => string,
): RequestProcessor<TName, TQuery, TResult> => {
    return {
        name,
        querySchema,
        resultSchema,
        createKey,
    };
};
