import { z } from 'zod';

export type RequestProcessor<TName extends string, TQuery, TResult> = {
    name: TName,
    querySchema: z.Schema<TQuery>,
    resultSchema: z.Schema<TResult>,
    createKey: (data: TQuery) => string
};
