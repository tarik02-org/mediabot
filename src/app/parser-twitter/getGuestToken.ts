import got from 'got';
import { z } from 'zod';
import { DEFAULT_HEADERS } from './common.js';

export const getGuestToken = async (authToken: string) => {
    const response = await got.post('https://api.twitter.com/1.1/guest/activate.json', {
        headers: {
            ...DEFAULT_HEADERS,
            Authorization: `Bearer ${ authToken }`
        }
    }).json();

    const { guest_token: guestToken } = z.object({
        guest_token: z.string()
    }).parse(
        response
    );

    return guestToken;
};
