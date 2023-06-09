import got from 'got';

import { DEFAULT_HEADERS } from './common';
import { redis } from './deps';

export const getStatus = async (
    id: string,
    {
        authToken,
        guestToken,
    }: {
        authToken: string,
        guestToken: string,
    },
) => await redis.redlock.using(
    [ `${ redis.prefix }:twitter:status:${ id }:lock` ],
    5 * 1000,
    async () => {
        const cacheKey = `${ redis.prefix }:twitter:status:${ id }:cache`;
        const cachedResponse = await redis.client.get(cacheKey);
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

        await redis.client.setex(cacheKey, 60, JSON.stringify(response));
        return response;
    },
);
