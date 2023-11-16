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

const imagePostSchema = z.object({
    images: z.array(z.object({
        imageURL: z.object({
            urlList: z.array(z.string()),
        }),
        imageWidth: z.number(),
        imageHeight: z.number(),
    })),
});

const videoSchema = z.object({
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
});

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

    const convertImagePost = (imagePost: z.TypeOf<typeof imagePostSchema>) => ({
        images: imagePost.images.map(image => ({
            width: image.imageWidth,
            height: image.imageHeight,

            download: async () => await got.get(image.imageURL.urlList[0], {
                headers: {
                    ...DEFAULT_HEADERS,
                },
                followRedirect: false,
            }).buffer(),
        })),
    });

    const convertVideo = (video: z.TypeOf<typeof videoSchema>) => ({
        video: {
            width: video.width,
            height: video.height,
            duration: video.duration,
        },

        downloadVideo: async () => await got.get(video.bitrateInfo[0].PlayAddr.UrlList[0], {
            headers: {
                ...DEFAULT_HEADERS,
            },
            followRedirect: false,
        }).buffer(),
    });

    const universalDataForRehydrationParseResult = z.object({
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
                                imagePost: imagePostSchema,
                            }).transform(data => ({
                                ...data,
                                type: 'images' as const,
                            })),
                            z.object({
                                video: videoSchema,
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
    }).safeParse(
        JSON.parse(dom.window.document.querySelector<HTMLScriptElement>('script#__UNIVERSAL_DATA_FOR_REHYDRATION__')?.textContent ?? '{}')
    );

    if (universalDataForRehydrationParseResult.success) {
        const {
            __DEFAULT_SCOPE__: {
                'webapp.video-detail': {
                    itemInfo: { itemStruct },
                    shareMeta,
                },
            }
        } = universalDataForRehydrationParseResult.data;
        
        const url = `https://www.tiktok.com/@${itemStruct.author.uniqueId}/video/${itemStruct.id}`;

        switch (itemStruct.type) {
            case 'images':
                return {
                    title: shareMeta.desc,
                    url,
                    type: 'images' as const,
                    ...convertImagePost(itemStruct.imagePost),
                };

            case 'video':
                return {
                    title: shareMeta.desc,
                    url,
                    type: 'video' as const,
                    ...convertVideo(itemStruct.video),
                };
        }
    }

    const sigiParseResult = z.object({
        ItemModule: z.record(
            z.intersection(
                z.object({
                    id: z.string(),
                    desc: z.string(),
                    author: z.string(),
                }),
                z.union([
                    z.object({
                        imagePost: imagePostSchema,
                    }).transform(data => ({
                        ...data,
                        type: 'images' as const,
                    })),
                    z.object({
                        video: videoSchema,
                    }).transform(data => ({
                        ...data,
                        type: 'video' as const,
                    })),
                ]),
            ),
        ),
    }).safeParse(
        JSON.parse(dom.window.document.querySelector<HTMLScriptElement>('script#SIGI_STATE')?.textContent ?? '{}')
    );

    if (sigiParseResult.success) {
        const module = Object.values(sigiParseResult.data.ItemModule)[0];

        const url = `https://www.tiktok.com/@${module.author}/video/${module.id}`;

        switch (module.type) {
            case 'images':
                return {
                    title: module.desc,
                    url,
                    type: 'images' as const,
                    ...convertImagePost(module.imagePost),
                };

            case 'video':
                return {
                    title: module.desc,
                    url,
                    type: 'video' as const,
                    ...convertVideo(module.video),
                };
        }
    }

    throw new Error(`universalDataForRehydration and sigiState failed to parse: ${universalDataForRehydrationParseResult.error.format()}, ${sigiParseResult.error.format()}`);
};
