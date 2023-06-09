import { z } from 'zod';

import { Callback } from './Callback';

export type BoundCallback<TCallback extends Callback<any, any>> = {
    context: z.TypeOf<TCallback['context']>,
    callback: TCallback
};
