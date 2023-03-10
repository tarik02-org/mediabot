import htmlspecialchars from 'htmlspecialchars';
import { DateTime } from 'luxon';
import * as nodePath from 'node:path';
import { TwingEnvironment, TwingErrorRuntime, TwingFilter, TwingFunction, TwingLoaderFilesystem } from 'twing';
import { z } from 'zod';

import { unicodeSubstring } from '../utils/unicodeSubstring.js';

import { resourcesPath } from './index.js';

export const twing = new TwingEnvironment(
    new TwingLoaderFilesystem([
        nodePath.join(
            resourcesPath,
            './views',
        ),
    ]),
    {
        strict_variables: true,
        debug: true,
    },
);

twing.addFilter(new TwingFilter('parse_date', async (date, format) => {
    const dateTime = DateTime.fromFormat(date, format);
    if (!dateTime.isValid) {
        throw new TwingErrorRuntime(`Invalid date "${ date }" for format "${ format }"`);
    }

    return dateTime.toJSDate();
}, [
    { name: 'format' },
]));

twing.addFunction(new TwingFunction('date_diff', async (from, to) => {
    return DateTime.fromJSDate(from).diff(
        DateTime.fromJSDate(to),
    );
}, [
    { name: 'from' },
    { name: 'to' },
]));

twing.addFunction(new TwingFunction('twitter_text', async args => {
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

    const highlightedTextRanges = [];

    for (const [ type, items ] of Object.entries(entities)) {
        for (const item of items) {
            highlightedTextRanges.push([ item.indices[ 0 ], type, item ] as const);
        }
    }
    highlightedTextRanges.sort((a, b) => a[ 0 ] - b[ 0 ]);

    let previous = displayTextRange[ 0 ];
    const parts = [];

    for (const [ , type, item ] of highlightedTextRanges) {
        const [ start, end ] = item.indices;

        if (previous < start) {
            parts.push([ 'text', unicodeSubstring(text, previous, start) ]);
        }

        if (previous < start && end < displayTextRange[ 1 ]) {
            parts.push([ type, item ]);
        }

        previous = end;
    }

    if (previous < displayTextRange[ 1 ]) {
        parts.push([ 'text', unicodeSubstring(text, previous, displayTextRange[ 1 ]) ]);
    }

    return parts
        .map(([ type, data ]) => {
            switch (type) {
                case 'text':
                    return data;

                case 'urls':
                    return removedUrls.includes(data.url)
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
