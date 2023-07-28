import Got from 'got';
import { JSDOM } from 'jsdom';
import { Cookie, CookieJar } from 'tough-cookie';
import { z } from 'zod';

import { Query } from '.';

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/110.0';
const DEFAULT_HEADERS = {
    'User-Agent': USER_AGENT,
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache',
    'DNT': '1',
    'Accept': '*/*',
    'Sec-Fetch-Site': 'same-site',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Dest': 'video',
    'Referer': 'https://www.tiktok.com/',
    'Accept-Language': 'en-US,en;q=0.9,bs;q=0.8,sr;q=0.7,hr;q=0.6',
    'sec-gpc': '1',
    'Range': 'bytes=0-',
};

export const downloadFromTiktok = async (query: Query) => {
    const cookieJar = new CookieJar();

    const sessionId = process.env.TT_SESSION_ID;
    if (sessionId) {
        await cookieJar.setCookie(new Cookie({
            key: 'sessionid',
            value: sessionId,
            domain: 'www.tiktok.com',
        }), 'https://www.tiktok.com/');

        await cookieJar.setCookie(new Cookie({
            key: 'sessionid_ss',
            value: sessionId,
            domain: 'www.tiktok.com',
        }), 'https://www.tiktok.com/');
    }

    const got = Got.extend({
        cookieJar,
    });

    const dom = new JSDOM(
        await got(query.source, {
            headers: {
                ...DEFAULT_HEADERS,
            },
        }).text(),
    );

    const data = z.object({
        ItemModule: z.record(
            z.union([
                z.object({
                    imagePost: z.object({
                        images: z.array(z.object({
                            imageURL: z.object({
                                urlList: z.array(z.string()),
                            }),
                            imageWidth: z.number(),
                            imageHeight: z.number(),
                        })),
                    }),
                }),
                z.object({
                    video: z.object({
                        playAddr: z.string(),
                        width: z.number(),
                        height: z.number(),
                        duration: z.number(),
                    }),
                }),
            ]),
        ),
        SEOState: z.object({
            metaParams: z.object({
                title: z.string(),
                description: z.string(),
                canonicalHref: z.string(),
            }),
        }),
    }).parse(
        JSON.parse(
            dom.window.document.querySelector<HTMLScriptElement>('script#SIGI_STATE')!.textContent!,
        ),
    );

    const module = Object.values(data.ItemModule)[ 0 ];

    if ('imagePost' in module) {
        return {
            title: data.SEOState.metaParams.title,
            url: data.SEOState.metaParams.canonicalHref,

            type: 'images',

            images: module.imagePost.images.map(image => ({
                width: image.imageWidth,
                height: image.imageHeight,

                download: async () => await got.get(image.imageURL.urlList[ 0 ], {
                    headers: {
                        ...DEFAULT_HEADERS,
                    },
                    followRedirect: false,
                }).buffer(),
            })),
        } as const;
    }

    if ('video' in module) {
        return {
            title: data.SEOState.metaParams.title,
            url: data.SEOState.metaParams.canonicalHref,

            type: 'video',

            video: {
                width: module.video.width,
                height: module.video.height,
                duration: module.video.duration,
            },

            downloadVideo: async () => await got.get(module.video.playAddr, {
                headers: {
                    ...DEFAULT_HEADERS,
                },
                followRedirect: false,
            }).buffer(),
        } as const;
    }

    throw new Error('Unknown module type');
};
