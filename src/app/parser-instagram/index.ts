import '../../env.js';

import lodash from 'lodash';
import * as nodePath from 'node:path';
import * as process from 'node:process';
import { Browser } from 'puppeteer';
import * as radash from 'radash';
import { z } from 'zod';

import { InstagramParserAccount } from '../../../generated/prisma-client/index.js';
import { log } from '../../log.js';
import { prisma } from '../../prisma.js';
import { RetryRequestError, processRequests } from '../../resolvers/lib.js';
import { filter, makeSearcher, walkDeep } from '../../utils/objectSearch.js';

import { processor } from './api.js';
import { createGmail } from './gmail.js';
import { login } from './instagram/login.js';
import { createPuppeteer } from './puppeteer.js';
import { RawMediaSchema, RawMediaType } from './schema.js';
import { useInstagramParserAccount } from './useInstagramParserAccount.js';

const findSharedData = makeSearcher(
    walkDeep,
    filter(item => item instanceof Array && item[ 0 ] === 'XIGSharedData'),
    '2.native',
);

const findPostData = makeSearcher(
    walkDeep,
    filter(item => item instanceof Object && item.tracePolicy === 'polaris.postPage'),
);

const findStoryData = makeSearcher(
    walkDeep,
    filter(item => item instanceof Object && item.tracePolicy === 'polaris.StoriesPage'),
);

const env = z.object({
    PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
    PUPPETEER_ARGS: z.preprocess(
        (value: unknown) => typeof value === 'string' ? value.split(' ') : value,
        z.array(z.string()),
    ).optional(),
    PUPPETEER_DATA_PATH: z.string().optional(),
    PUPPETEER_REMOTE_URL: z.string().optional(),
    PUPPETEER_PROXY: z.string().optional(),
}).parse(
    process.env,
);

await radash.defer(async defer => {
    const abortController = new AbortController();
    defer(() => abortController.abort());

    let account: InstagramParserAccount | null = null;

    log.info('Looking for active unused instagram account...');

    do {
        if (abortController.signal.aborted) {
            return;
        }

        account = await useInstagramParserAccount({
            signal: abortController.signal,
        });
    } while (account === null);

    log.info({
        username: account.username,
    }, 'Found account');

    const gmailTwoFactorAuthData = z.object({
        type: z.literal('authorized_user'),
        client_id: z.string(),
        client_secret: z.string(),
        refresh_token: z.string(),
    }).nullable().parse(account.gmailTwoFactorAuthData);

    const gmail = gmailTwoFactorAuthData !== null
        ? await createGmail({
            credentials: gmailTwoFactorAuthData,
        })
        : null;

    const puppeteer = await createPuppeteer({
        proxy: env.PUPPETEER_PROXY,
    });

    let browser: Browser;

    if (env.PUPPETEER_REMOTE_URL !== undefined) {
        browser = await puppeteer.connect({
            browserURL: env.PUPPETEER_REMOTE_URL,
        });

        defer(async () => await browser.close());
    } else {
        browser = await puppeteer.launch({
            executablePath: env.PUPPETEER_EXECUTABLE_PATH,
            args: env.PUPPETEER_ARGS,
            userDataDir: env.PUPPETEER_DATA_PATH ?? nodePath.join(process.cwd(), './data', account.username),
            defaultViewport: { width: 1280, height: 1600 },
        });

        defer(() => browser.disconnect());
    }

    await login(browser, {
        username: account.username,
        password: account.password,

        resolveVerificationCode: async () => {
            const code = await gmail?.resolveVerifyCode();
            if (code === undefined) {
                throw new Error('No verification code found');
            }
            return code;
        },
    });

    const handleChallenge = async (): Promise<never> => {
        abortController.abort(new Error('Instagram challenge'));
        await prisma.instagramParserAccount.update({
            where: {
                id: account!.id,
            },
            data: {
                isActive: false,
            },
        });

        throw new RetryRequestError();
    };

    const computeForLink = async (link: string) => radash.defer(async defer => {
        const page = await browser.newPage();
        defer(async () => await page.close());

        log.debug({
            link,
        }, 'Processing link');

        let graphQlResponse: any = null;

        page.on('response', async response => {
            log.debug({
                url: response.url(),
            }, 'Response received');

            if ((new URL(response.url())).pathname.match(/^\/graphql\/query\/?$/)) {
                const json = await response.json();

                log.debug({
                    json,
                }, 'graph ql response');

                if (graphQlResponse === null) {
                    graphQlResponse = json;
                }
            }
        });

        await page.goto(link, {
            waitUntil: 'networkidle2',
        });

        if (new URL(page.url()).pathname.match(/^\/challenge\/?$/)) {
            log.warn('Challenge');

            await handleChallenge();
        }

        const details = (
            await page.evaluate(() => {
                return Array.from(
                    document.querySelectorAll<HTMLScriptElement>('script[type="application/json"][data-sjs]'),
                ).map(
                    script => (JSON.parse(script.innerText) as any).require,
                );
            })
        ).flat(1);

        if (details.length === 0) {
            log.warn({
                url: page.url(),
                content: await page.content(),
            }, 'No details found');
        } else {
            log.debug({
                link,
                details,
            }, 'Details on the page');
        }

        const sharedData = findSharedData(details)[ 0 ];
        const postData = findPostData(details)[ 0 ];
        const storyData = findStoryData(details)[ 0 ];

        log.debug({
            link,
            sharedData,
            postData,
            storyData,
        }, 'Data on the page');

        const rawMedia = [];

        let title = postData?.meta.title ?? null;
        let url: string | null = null;
        const media: any[] = [];

        switch (true) {
            case !!lodash.get(postData, 'rootView.props.media_id'): {
                url = `https://www.instagram.com${ postData.url }`;

                const rawData = await page.evaluate(
                    async (url: string) => {
                        const response = await fetch(url, {
                            headers: {
                                'X-IG-App-ID': '936619743392459',
                                'X-ASBD-ID': '198387',
                                'X-IG-WWW-Claim': '0',
                                'Accept': '*/*',
                            },
                            credentials: 'include',
                        });
                        return await response.json();
                    },
                    `https://i.instagram.com/api/v1/media/${ postData.rootView.props.media_id }/info/`,
                );

                if (z.object({
                    message: z.literal('checkpoint_required'),
                }).safeParse(rawData).success) {
                    await handleChallenge();
                }

                log.debug({
                    data: rawData,
                }, 'media data');

                const data = z.object({
                    items: z.array(RawMediaSchema),
                }).parse(
                    rawData,
                );

                title = data.items[ 0 ]?.caption?.text ?? null;

                rawMedia.push(
                    ...data.items,
                );
                break;
            }

            case !!lodash.get(storyData, 'rootView.props.user.id'): {
                url = `https://www.instagram.com${ storyData.url }`;

                const userId = storyData.rootView.props.user.id;

                const rawData = await page.evaluate(
                    async (url: string) => {
                        const response = await fetch(url, {
                            headers: {
                                'X-IG-App-ID': '936619743392459',
                                'X-ASBD-ID': '198387',
                                'X-IG-WWW-Claim': '0',
                                'Accept': '*/*',
                            },
                            credentials: 'include',
                        });
                        return await response.json();
                    },
                    `https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=${ userId }`,
                );

                log.debug({
                    data: rawData,
                }, 'media data');

                const data = z.object({
                    reels: z.record(
                        z.literal(userId),
                        z.object({
                            user: z.object({
                                full_name: z.string().nullish(),
                                username: z.string().nullish(),
                            }),
                            items: z.array(RawMediaSchema),
                        }),
                    ),
                }).parse(
                    rawData,
                );

                title = data.reels[ userId ].user.full_name || data.reels[ userId ].user.username || null;

                const reel = data.reels[ userId ].items.find(
                    item => item.pk === storyData.params.initial_media_id,
                );
                if (reel) {
                    rawMedia.push(reel);
                }
                break;
            }

            case !!lodash.get(graphQlResponse, 'data.xdt_api__v1__media__shortcode__web_info.items'): {
                const { items } = graphQlResponse.data.xdt_api__v1__media__shortcode__web_info;
                title = items[ 0 ].caption.text;

                rawMedia.push(...items);
                break;
            }

            case !!lodash.get(graphQlResponse, 'data.shortcode_media'): {
                const mediaData = graphQlResponse.data.shortcode_media;

                const items = mediaData.edge_sidecar_to_children?.edges.map((edge: any) => edge.node) || [ mediaData ];
                title = mediaData.edge_media_to_caption.edges[ 0 ].node.text;

                for (const item of items) {
                    switch (true) {
                        case item.is_video:
                            // item.dimensions.width
                            // item.dimensions.height
                            // item.video_duration
                            // item.video_url
                            media.push({
                                type: 'video',
                                url: item.video_url,
                            });
                            break;

                        default:
                            // item.dimensions.width
                            // item.dimensions.height
                            media.push({
                                type: 'photo',
                                url: item.display_url,
                            });
                            break;
                    }
                }
                break;
            }

            default: {
                throw new Error('Unhandled page type');
            }
        }

        const processMedia = (item: z.TypeOf<typeof RawMediaSchema>) => {
            switch (item.media_type) {
                case RawMediaType.PHOTO:
                    media.push({
                        type: 'photo',
                        url: item.image_versions2.candidates[ 0 ].url,
                    });
                    break;

                case RawMediaType.VIDEO:
                    media.push({
                        type: 'video',
                        url: item.video_versions[ 0 ].url,
                    });
                    break;

                case RawMediaType.CAROUSEL:
                    for (const carouselItem of item.carousel_media) {
                        processMedia(carouselItem);
                    }
                    break;
            }
        };

        for (const item of rawMedia) {
            processMedia(item);
        }

        if (media.length === 0) {
            throw new Error('No media found');
        }

        return {
            title,
            url,
            media,
        };
    });

    await processRequests(
        processor,
        async ({ link }) => {
            if (abortController.signal.aborted) {
                throw new RetryRequestError();
            }
            return await computeForLink(link);
        },
        {
            abortSignal: abortController.signal,
            concurrency: 1,
        },
    );
});

setTimeout(() => {
    process.exit(0);
}, 1000);
