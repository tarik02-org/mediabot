import '../../env.js';

import chalk from 'chalk';
import lodash from 'lodash';
import * as nodePath from 'node:path';
import * as process from 'node:process';
import prompts from 'prompts';
import { Browser } from 'puppeteer';
import * as radash from 'radash';
import { z } from 'zod';

import { log } from '../../log.js';
import { processRequests } from '../../resolvers/lib.js';
import { filter, makeSearcher, walkDeep } from '../../utils/objectSearch.js';

import { processor } from './api.js';
import { createGmail } from './gmail.js';
import { login } from './instagram/login.js';
import { createPuppeteer } from './puppeteer.js';

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
    CLIENT_ID: z.string(),
    CLIENT_SECRET: z.string(),
    REDIRECT_URI: z.string(),
    IG_USERNAME: z.string(),
    IG_PASSWORD: z.string(),

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

radash.defer(async defer => {
    const gmail = await createGmail({
        clientId: env.CLIENT_ID,
        clientSecret: env.CLIENT_SECRET,
        redirectUri: env.REDIRECT_URI,

        askAuth: async (url: string) => {
            process.stdout.write('\n');
            process.stdout.write(`Visit this URL: ${ chalk.blue(url) }\n`);
            process.stdout.write('Enter the url of redirected page here.\n');
            process.stdout.write('\n');

            const { url: resultUrl } = await prompts({
                type: 'text',
                name: 'url',
                message: 'URL',
            });

            return resultUrl;
        },
    });

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
            userDataDir: env.PUPPETEER_DATA_PATH ?? nodePath.join(process.cwd(), './data'),
            defaultViewport: { width: 1280, height: 1600 },
        });

        defer(() => browser.disconnect());
    }

    await login(browser, {
        username: env.IG_USERNAME,
        password: env.IG_PASSWORD,

        resolveVerificationCode: async () => {
            const code = await gmail.resolveVerifyCode();
            if (code === undefined) {
                throw new Error('No verification code found');
            }
            return code;
        },
    });

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

                const data = await page.evaluate(
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

                log.debug({
                    data
                }, 'media data');

                rawMedia.push(
                    ...data.items,
                );
                break;
            }

            case !!lodash.get(storyData, 'rootView.props.user.id'): {
                url = `https://www.instagram.com${ storyData.url }`;

                const userId = storyData.rootView.props.user.id;

                const data = await page.evaluate(
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

                title = data.reels[ userId ].user.full_name || data.reels[ userId ].user.username || null;

                const reel = lodash.get(data, `reels.${ userId }.items`, []).find(
                    item => item.pk === storyData.params.initial_media_id,
                );
                if (reel) {
                    rawMedia.push(reel);
                }

                //
                break;
            }

            case !!lodash.get(graphQlResponse, 'data.xdt_api__v1__media__shortcode__web_info.items'): {
                const { items } = graphQlResponse.data.xdt_api__v1__media__shortcode__web_info;
                title = items[ 0 ].caption.text;

                rawMedia.push(...items);
                break;
            }

            case !!lodash.get(graphQlResponse, 'data.shortcode_media'): {
                const media = graphQlResponse.data.shortcode_media;

                const items = media.edge_sidecar_to_children?.edges.map((edge: any) => edge.node) || [ media ];
                title = media.edge_media_to_caption.edges[ 0 ].node.text;

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

        const processMedia = (item: any) => {
            if (item.video_versions) {
                media.push({
                    type: 'video',
                    url: item.video_versions[ 0 ].url,
                });
            } else if (item.image_versions2) {
                media.push({
                    type: 'photo',
                    url: item.image_versions2.candidates[ 0 ].url,
                });
            } else if (item.carousel_media) {
                for (const carouselItem of item.carousel_media) {
                    processMedia(carouselItem);
                }
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
        ({ link }) => computeForLink(link),
        {
            concurrency: 4,
        },
    );
});
