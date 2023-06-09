import { RequestProcessor } from './RequestProcessor';

export const createRequestMatcher = <TQuery>(
    regex: RegExp | RegExp[],
    prepareQuery: (match: RegExpMatchArray) => TQuery,
    processor: RequestProcessor<string, TQuery, any>,
) => {
    return {
        regex: regex instanceof Array ? regex : [ regex ],
        prepareQuery,
        processor,
    };
};
