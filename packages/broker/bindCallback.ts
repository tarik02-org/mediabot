import { z } from 'zod';

import { BoundCallback } from './BoundCallback';
import { Callback } from './Callback';

export const bindCallback = <TCallback extends Callback<any, any>>(callback: TCallback, context: z.TypeOf<TCallback['context']>): BoundCallback<TCallback> => {
    return {
        context,
        callback,
    };
};
