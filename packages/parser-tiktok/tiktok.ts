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

    const {
        __DEFAULT_SCOPE__: {
            'webapp.video-detail': {
                itemInfo: { itemStruct },
                shareMeta,
            },
        }
    } = z.object({
        __DEFAULT_SCOPE__: z.object({
            'webapp.video-detail': z.object({
                itemInfo: z.object({
                    itemStruct: z.intersection(
                        z.object({
                            id: z.string(),
                            desc: z.string(),
                            author: z.object({
                                uniqueId: z.string(),
                            }),
                        }),
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
                            }).transform(data => ({
                                ...data,
                                type: 'images' as const,
                            })),
                            z.object({
                                video: z.object({
                                    width: z.number(),
                                    height: z.number(),
                                    duration: z.number(),
                                    playAddr: z.string(),
                                    downloadAddr: z.string(),
                                    bitrateInfo: z.array(z.object({
                                        PlayAddr: z.object({
                                            UrlList: z.array(z.string()),
                                        }),
                                    })),
                                }),
                            }).transform(data => ({
                                ...data,
                                type: 'video' as const,
                            })),
                        ]),
                    ),
                }),
                shareMeta: z.object({
                    title: z.string(),
                    desc: z.string(),
                }),
            }),
        }),
    }).parse(
        JSON.parse(
            dom.window.document.querySelector<HTMLScriptElement>('script#__UNIVERSAL_DATA_FOR_REHYDRATION__')!.textContent!,
        ),
    );

    const url = `https://www.tiktok.com/@${itemStruct.author.uniqueId}/video/${itemStruct.id}`;

    switch (itemStruct.type) {
        case 'images':
            return {
                title: shareMeta.desc,
                url,

                type: 'images' as const,

                images: itemStruct.imagePost.images.map(image => ({
                    width: image.imageWidth,
                    height: image.imageHeight,

                    download: async () => await got.get(image.imageURL.urlList[0], {
                        headers: {
                            ...DEFAULT_HEADERS,
                        },
                        followRedirect: false,
                    }).buffer(),
                })),
            };

        case 'video':
            return {
                title: shareMeta.desc,
                url,

                type: 'video' as const,

                video: {
                    width: itemStruct.video.width,
                    height: itemStruct.video.height,
                    duration: itemStruct.video.duration,
                },
    
                downloadVideo: async () => await got.get(itemStruct.video.bitrateInfo[0].PlayAddr.UrlList[0], {
                    headers: {
                        ...DEFAULT_HEADERS,
                    },
                    followRedirect: false,
                }).buffer(),
            };
    }
};
