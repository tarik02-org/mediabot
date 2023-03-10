import '../../env';

import puppeteer from 'puppeteer';
import * as radash from 'radash';
import * as uuid from 'uuid';

import { redis, redisPrefix } from '../../redis.js';
import { processRequests } from '../../resolvers/lib.js';

import { processor } from './api.js';

await radash.defer(async defer => {
    const browser = await puppeteer.launch();
    defer(async () => await browser.close());

    await processRequests(
        processor,
        async query => await radash.defer(async defer => {
            const page = await browser.newPage();
            defer(async () => await page.close());

            await page.setViewport({
                width: query.viewport?.width ?? 720,
                height: query.viewport?.height ?? 1280,
                deviceScaleFactor: query.viewport?.deviceScaleFactor ?? 2,
            });

            await page.setContent(
                Buffer.from(query.content, 'base64').toString('utf-8'),
            );

            const rect = await page.evaluate(selector => {
                const root = document.querySelector(selector);
                const rect = root?.getBoundingClientRect();
                return rect !== undefined
                    ? {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                    }
                    : null;
            }, query.selector ?? 'body');

            if (rect === null) {
                throw new Error(`Failed to find element by selector "${ query.selector }"`);
            }

            const screenshot = await page.screenshot({
                type: 'png',
                omitBackground: true,
                clip: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                },
            });

            const ref = `render:${ uuid.v4() }`;
            await redis.setex(`${ redisPrefix }:${ ref }`, 120, screenshot);

            return {
                ref,
                width: rect.width,
                height: rect.height,
            };
        }),
        {
            concurrency: 16,
            cacheTimeout: 60,
        },
    );
});
