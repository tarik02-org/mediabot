import htmlspecialchars from 'htmlspecialchars';
import { DateTime, Duration } from 'luxon';
import * as nodePath from 'node:path';
import { TwingEnvironment, TwingErrorRuntime, TwingFilter, TwingFunction, TwingLoaderFilesystem } from 'twing';
import { z } from 'zod';

import { unicodeSubstring } from '../utils/unicodeSubstring.ts';

import { resourcesPath } from './index.ts';

const loader = new TwingLoaderFilesystem([
    nodePath.join(
        resourcesPath,
        './views',
    ),
]);

let cachedEnvironment: TwingEnvironment | null = null;

export const getEnvironment = () => {
    if (cachedEnvironment !== null) {
        return cachedEnvironment;
    }

    const environment = new TwingEnvironment(
        loader,
        {
            strict_variables: true,
            debug: process.env.NODE_ENV === 'development',
            auto_reload: process.env.NODE_ENV === 'development',
            cache: false,
        },
    );

    environment.addFilter(new TwingFilter('parse_date', async (date, format) => {
        const dateTime = DateTime.fromFormat(date, format);
        if (!dateTime.isValid) {
            throw new TwingErrorRuntime(`Invalid date "${ date }" for format "${ format }"`);
        }

        return dateTime.toJSDate();
    }, [
        { name: 'format' },
    ], {

    }));

    environment.addFunction(new TwingFunction('date_diff', async (from, to) => {
        return DateTime.fromJSDate(from).diff(
            DateTime.fromJSDate(to),
        );
    }, [
        { name: 'from' },
        { name: 'to' },
    ]));

    environment.addFilter(new TwingFilter('human_duration', async date => {
        return Duration.fromDurationLike(date).rescale().toHuman();
    }, [
        { name: 'date' },
    ]));

    environment.addFunction(new TwingFunction('twitter_text', async args => {
        const toObject = (value: any) => value instanceof Map ? Object.fromEntries(value.entries()) : value;
        const toArray = (value: any) => value instanceof Map ? Array.from(value.values()) : value;

        const {
            text,
            displayTextRange,
            entities,
            removedUrls = [],
        } = z.preprocess(
            toObject,
            z.object({
                text: z.string(),
                displayTextRange: z.preprocess(toArray, z.tuple([ z.number(), z.number() ])),
                entities: z.preprocess(
                    toObject,
                    z.object({
                        urls: z.preprocess(toArray, z.array(
                            z.preprocess(toObject, z.object({
                                indices: z.preprocess(toArray, z.tuple([ z.number(), z.number() ])),
                                display_url: z.string(),
                            })),
                        )),
                        hashtags: z.preprocess(toArray, z.array(
                            z.preprocess(toObject, z.object({
                                indices: z.preprocess(toArray, z.tuple([ z.number(), z.number() ])),
                                text: z.string(),
                            })),
                        )),
                        user_mentions: z.preprocess(toArray, z.array(
                            z.preprocess(toObject, z.object({
                                indices: z.preprocess(toArray, z.tuple([ z.number(), z.number() ])),
                                screen_name: z.string(),
                            })),
                        )),
                        symbols: z.preprocess(toArray, z.array(
                            z.preprocess(toObject, z.object({
                                indices: z.preprocess(toArray, z.tuple([ z.number(), z.number() ])),
                                text: z.string(),
                            })),
                        )),
                    }),
                ),
                removedUrls: z.preprocess(toArray, z.array(z.string())),
            }),
        ).parse(
            args,
        );

        const highlightedTextRanges: Array<(
            {
                [K in keyof typeof entities]: { index: number, type: K, data: (typeof entities)[K][number] }
            }[keyof typeof entities]
        )> = [];

        for (const item of entities.urls) {
            highlightedTextRanges.push({ index: item.indices[ 0 ], type: 'urls', data: item });
        }
        for (const item of entities.hashtags) {
            highlightedTextRanges.push({ index: item.indices[ 0 ], type: 'hashtags', data: item });
        }
        for (const item of entities.user_mentions) {
            highlightedTextRanges.push({ index: item.indices[ 0 ], type: 'user_mentions', data: item });
        }
        for (const item of entities.symbols) {
            highlightedTextRanges.push({ index: item.indices[ 0 ], type: 'symbols', data: item });
        }
        highlightedTextRanges.sort((a, b) => a.index - b.index);

        let previous = displayTextRange[ 0 ];
        const parts: Array<(
            | {
                type: 'text',
                data: string
            }
            | {
                [K in keyof typeof entities]: { type: K, data: (typeof entities)[K][number] }
            }[keyof typeof entities]
        )> = [];

        for (const range of highlightedTextRanges) {
            const [ start, end ] = range.data.indices;

            if (previous < start) {
                parts.push({
                    type: 'text',
                    data: unicodeSubstring(text, previous, start),
                });
            }

            if (previous < start && end < displayTextRange[ 1 ]) {
                parts.push(range);
            }

            previous = end;
        }

        if (previous < displayTextRange[ 1 ]) {
            parts.push({
                type: 'text',
                data: unicodeSubstring(text, previous, displayTextRange[ 1 ]),
            });
        }

        return parts
            .map(({ type, data }) => {
                switch (type) {
                    case 'text':
                        return data;

                    case 'urls':
                        return removedUrls.includes(data.display_url)
                            ? ''
                            : `<span class="text-[#1D9BF0]">${ data.display_url }</span>`;

                    case 'hashtags':
                        return `<span class="text-[#1D9BF0]">#${ htmlspecialchars(data.text) }</span>`;

                    case 'user_mentions':
                        return `<span class="text-[#1D9BF0]">@${ htmlspecialchars(data.screen_name) }</span>`;

                    case 'symbols':
                        return `<span class="text-[#1D9BF0]">$${ htmlspecialchars(data.text) }</span>`;

                    default:
                        return '';
                }
            })
            .join('')
            .trim();
    }, [
        { name: 'data' },
    ], {
        is_safe: [ 'html' ],
    }));

    if (process.env.NODE_ENV === 'production') {
        cachedEnvironment = environment;
    }

    return environment;
};

export const render = (name: string, context: any) => getEnvironment().render(name, context);
