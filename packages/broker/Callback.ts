import { z } from 'zod';

import { RequestProcessor } from './RequestProcessor';

export type Callback<TContext, TProcessors extends ReadonlyArray<RequestProcessor<string, any, any>>> = {
    name: string,
    context: z.Schema<TContext>,
    processors: TProcessors
};
