import got from 'got';

import { redis, redisPrefix, redlock } from '../../redis.js';

import { DEFAULT_HEADERS } from './common.js';

export const getStatus = async (
    id: string,
    {
        authToken,
        guestToken,
    }: {
        authToken: string,
        guestToken: string
    },
) => await redlock.using(
    [ `${ redisPrefix }:twitter:status:${ id }:lock` ],
    5 * 1000,
    async () => {
        const cacheKey = `${ redisPrefix }:twitter:status:${ id }:cache`;
        const cachedResponse = await redis.get(cacheKey);
        if (cachedResponse !== null) {
            return JSON.parse(cachedResponse);
        }

        const response = await got.get(`https://api.twitter.com/1.1/statuses/show/${ id }.json`, {
            searchParams: {
                cards_platform: 'Web-12',
                include_cards: '1',
                include_reply_count: '1',
                include_user_entities: '0',
                tweet_mode: 'extended',
            },
            headers: {
                ...DEFAULT_HEADERS,
                'Authorization': `Bearer ${ authToken }`,
                'X-Guest-Token': guestToken,
            },
        }).json();

        await redis.setex(cacheKey, 60, JSON.stringify(response));
        return response;
    },
);
