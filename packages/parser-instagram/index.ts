import lodash from 'lodash';
import * as nodePath from 'node:path';
import { Browser } from 'puppeteer';
import * as radash from 'radash';
import * as uuid from 'uuid';
import { z } from 'zod';

import { processRequests } from '@mediabot/broker/processRequests';
import { RetryRequestError } from '@mediabot/broker/RetryRequestError';
import { InstagramParserAccount } from '@mediabot/prisma';
import { filter, makeSearcher, walkDeep } from '@mediabot/utils/objectSearch';
import { sleep } from '@mediabot/utils/sleep';

import { processor } from './api';
import { env, log, prisma, redis } from './deps';
import { createGmail } from './gmail';
import { login } from './instagram/login';
import { createPuppeteer } from './puppeteer';
import { RawMediaSchema, RawMediaType } from './schema';
import { useInstagramParserAccount } from './useInstagramParserAccount';

export type Query = z.TypeOf<(typeof processor)['querySchema']>;
export type Result = z.TypeOf<(typeof processor)['resultSchema']>;

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

export const main = async (process: NodeJS.Process, abortSignal: AbortSignal) => await radash.defer(async defer => {
    let account: InstagramParserAccount | null = null;

    log.info('Looking for active unused instagram account...');

    do {
        if (abortSignal.aborted) {
            return;
        }

        account = await useInstagramParserAccount({
            signal: abortSignal,
        });

        await sleep(1000, abortSignal);
    } while (account === null);

    defer(async () => {
        await prisma.instagramParserAccount.update({
            where: { id: account!.id },
            data: {
                lastUsedAt: null,
            },
        });
    });

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

        defer(() => browser.disconnect());
    } else {
        browser = await puppeteer.launch({
            executablePath: env.PUPPETEER_EXECUTABLE_PATH,
            args: env.PUPPETEER_ARGS ?? [],
            userDataDir: env.PUPPETEER_DATA_PATH ?? nodePath.join(process.cwd(), './data', account.username),
            defaultViewport: { width: 1280, height: 1600 },
            handleSIGINT: false,
            handleSIGTERM: false,
        });

        defer(async () => await browser.close());
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
            log.trace({
                url: response.url(),
            }, 'Response received');

            if ((new URL(response.url())).pathname.match(/^\/graphql\/query\/?$/)) {
                const json = await response.json();

                log.trace({
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
            log.trace({
                link,
                details,
            }, 'Details on the page');
        }

        const sharedData = findSharedData(details)[ 0 ];
        const postData = findPostData(details)[ 0 ];
        const storyData = findStoryData(details)[ 0 ];

        log.trace({
            link,
            sharedData,
            postData,
            storyData,
        }, 'Data on the page');

        const rawMedia = [];

        let title = postData?.meta.title ?? null;
        let url: string | null = null;
        const media: Array<Result['media'][number]> = [];

        const downloadToRef = async (ref: string, url: string) => {
            log.debug({ ref, url }, 'Downloading raw');

            const data = Buffer.from(
                await page.evaluate(async url => {
                    const blob = await (await fetch(url)).blob();

                    return await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.addEventListener(
                            'loadend',
                            () => resolve(
                                (reader.result! as string).split(',')[ 1 ],
                            ),
                        );
                        reader.addEventListener('error', reject);
                        reader.readAsDataURL(blob);
                    });
                }, url),
                'base64url',
            );

            await redis.client.setex(`${ redis.prefix }:${ ref }`, 120, data);
        };

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

            case !!lodash.get(storyData, 'rootView.props.user.id') || !!lodash.get(storyData, 'rootView.props.user_id'): {
                url = `https://www.instagram.com${ storyData.url }`;

                const userId = storyData.rootView.props.user_id || storyData.rootView.props.user.id;

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

                log.debug({ items }, 'media items');

                for (const item of items) {
                    switch (true) {
                        case item.is_video: {
                            // item.dimensions.width
                            // item.dimensions.height
                            // item.video_duration
                            // item.video_url

                            const ref = `instagram:video:${ uuid.v4() }`;

                            await downloadToRef(ref, item.video_url);

                            media.push({
                                type: 'video',
                                data: {
                                    type: 'ref',
                                    ref,
                                    name: nodePath.basename(new URL(item.video_url).pathname),
                                },
                                size: {
                                    width: item.dimensions.width,
                                    height: item.dimensions.height,
                                },
                                duration: item.video_duration,
                            });
                            break;
                        }

                        default: {
                            // item.display_url
                            // item.dimensions.width
                            // item.dimensions.height

                            const ref = `instagram:photo:${ uuid.v4() }`;

                            await downloadToRef(ref, item.display_url);

                            media.push({
                                type: 'photo',
                                data: {
                                    type: 'ref',
                                    ref,
                                    name: nodePath.basename(new URL(item.display_url).pathname),
                                },
                                size: {
                                    width: item.dimensions.width,
                                    height: item.dimensions.height,
                                },
                            });
                            break;
                        }
                    }
                }
                break;
            }

            default: {
                throw new Error('Unhandled page type');
            }
        }

        const processMedia = async (item: z.TypeOf<typeof RawMediaSchema>): Promise<Array<Result['media'][number]>> => {
            switch (item.media_type) {
                case RawMediaType.PHOTO: {
                    const ref = `instagram:photo:${ uuid.v4() }`;

                    await downloadToRef(ref, item.image_versions2.candidates[ 0 ].url);

                    return [ {
                        type: 'photo',
                        data: {
                            type: 'ref',
                            ref,
                            name: nodePath.basename(new URL(item.image_versions2.candidates[ 0 ].url).pathname),
                        },
                    } ];
                }

                case RawMediaType.VIDEO: {
                    const ref = `instagram:video:${ uuid.v4() }`;

                    await downloadToRef(ref, item.video_versions[ 0 ].url);

                    return [ {
                        type: 'video',
                        data: {
                            type: 'ref',
                            ref,
                            name: nodePath.basename(new URL(item.video_versions[ 0 ].url).pathname),
                        },
                        size: {
                            width: item.video_versions[ 0 ].width,
                            height: item.video_versions[ 0 ].height,
                        },
                        duration: item.video_duration,
                    } ];
                }

                case RawMediaType.CAROUSEL:
                    return (
                        await Promise.all(
                            item.carousel_media.map(
                                async carouselItem => await processMedia(carouselItem),
                            ),
                        )
                    ).flat(1);
            }
        };

        media.push(
            ...(
                await Promise.all(
                    rawMedia.map(
                        async item => await processMedia(item),
                    ),
                )
            ).flat(1),
        );

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
        {
            prisma,
            redis,
            log,
        },
        processor,
        async ({ link }) => {
            if (abortSignal.aborted) {
                throw new RetryRequestError();
            }
            return await computeForLink(link);
        },
        {
            abortSignal,
            concurrency: 1,
        },
    );

    return 0;
});
