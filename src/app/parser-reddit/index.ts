import '../../env';

import Ky from 'ky';
import lodash from 'lodash';
import { z } from 'zod';

import { processRequests } from '../../resolvers/lib.js';

import { processor } from './api.js';

const ky = Ky.extend({
    headers: {
        Accept: 'application/json',
    },
});

const computeForLink = async (link: string): Promise<z.TypeOf<(typeof processor)['resultSchema']>> => {
    const data = await ky.get(link, {
        searchParams: {
            raw_json: '1',
        },
    }).json();

    const postData = z.object({
        title: z.string(),
        permalink: z.string(),
        media: z.optional(z.object({
            reddit_video: z.object({
                fallback_url: z.string(),
                width: z.number(),
                height: z.number(),
                duration: z.number(),
            }),
        })),
        over_18: z.boolean(),
    }).parse(
        lodash.get(data, '0.data.children.0.data', null),
    );

    const title = postData.title;
    const url = `https://www.reddit.com${ postData.permalink }`;

    if (postData.media) {
        const video = postData.media.reddit_video;

        return {
            title,
            url,
            media: [
                {
                    type: 'video',
                    url: video.fallback_url,
                    size: {
                        width: video.width,
                        height: video.height,
                    },
                    duration: video.duration,
                },
            ],
        };
    }

    throw new Error();
};

await processRequests(
    processor,
    ({ link }) => computeForLink(link),
    {
        concurrency: 10,
    },
);
