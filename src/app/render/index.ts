import '../../env.js';

import * as nodePath from 'node:path';
import * as process from 'node:process';
import puppeteer, { Browser } from 'puppeteer';
import * as radash from 'radash';
import * as uuid from 'uuid';
import { z } from 'zod';

import { redis, redisPrefix } from '../../redis.js';
import { processRequests } from '../../resolvers/lib.js';
import { useSignalHandler } from '../../utils/signalHandler.js';

import { processor } from './api.js';

const env = z.object({
    PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
    PUPPETEER_ARGS: z.preprocess(
        (value: unknown) => typeof value === 'string' ? value.split(' ') : value,
        z.array(z.string()),
    ).optional(),
    PUPPETEER_DATA_PATH: z.string().optional(),
    PUPPETEER_REMOTE_URL: z.string().optional(),
}).parse(
    process.env,
);

await radash.defer(async defer => {
    const abortController = new AbortController();
    defer(() => abortController.abort());

    defer(
        useSignalHandler(() => abortController.abort()),
    );

    let browser: Browser;

    if (env.PUPPETEER_REMOTE_URL !== undefined) {
        browser = await puppeteer.connect({
            browserURL: env.PUPPETEER_REMOTE_URL,
        });

        defer(() => browser.disconnect());
    } else {
        browser = await puppeteer.launch({
            executablePath: env.PUPPETEER_EXECUTABLE_PATH,
            userDataDir: env.PUPPETEER_DATA_PATH ?? nodePath.join(process.cwd(), './data'),
            args: env.PUPPETEER_ARGS,
            handleSIGINT: false,
            handleSIGTERM: false,
        });

        defer(async () => await browser.close());
    }

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
            abortSignal: abortController.signal,
            concurrency: 16,
            cacheTimeout: 60,
        },
    );
});
