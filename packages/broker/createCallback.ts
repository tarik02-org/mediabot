import { z } from 'zod';

import { Callback } from './Callback';
import { RequestProcessor } from './RequestProcessor';

export const createCallback = <TContext, TProcessors extends ReadonlyArray<RequestProcessor<string, any, any>>>(
    name: string,
    context: z.Schema<TContext>,
    processors: TProcessors,
): Callback<TContext, TProcessors> => {
    return {
        name,
        context,
        processors,
    };
};
