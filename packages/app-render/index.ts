import * as nodePath from 'node:path';
import * as process from 'node:process';
import puppeteer, { Browser } from 'puppeteer';
import * as radash from 'radash';
import * as uuid from 'uuid';
import { z } from 'zod';

import { createDefaultLogger } from '@mediabot/app/log';
import { createPrismaClient } from '@mediabot/app/prisma';
import { createRedisManager } from '@mediabot/app/redis';
import { processRequests } from '@mediabot/broker';
import { loadEnv } from '@mediabot/utils/loadEnv';

import { processor } from './api';

const env = z.object({
    REDIS_URL: z.string(),
    REDIS_PREFIX: z.string().default(''),

    DATABASE_URL: z.string(),

    PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
    PUPPETEER_ARGS: z.preprocess(
        (value: unknown) => typeof value === 'string' ? value.split(' ') : value,
        z.array(z.string()),
    ).optional(),
    PUPPETEER_DATA_PATH: z.string().optional(),
    PUPPETEER_REMOTE_URL: z.string().optional(),
}).parse(
    await loadEnv([
        '',
        'app-render',
        process.env,
    ]),
);

const log = createDefaultLogger();

const redis = createRedisManager({
    url: env.REDIS_URL,
    prefix: env.REDIS_PREFIX,
});

export const prisma = createPrismaClient(env.DATABASE_URL);

export const main = async (process: NodeJS.Process, abortSignal: AbortSignal) => await radash.defer(async defer => {
    await prisma.$connect();
    defer(async () => await prisma.$disconnect());
    defer(() => redis.client.disconnect());

    let browser: Browser;

    if (env.PUPPETEER_REMOTE_URL !== undefined) {
        log.info(`Connecting to remote browser at ${ env.PUPPETEER_REMOTE_URL }...`);

        browser = await puppeteer.connect({
            browserURL: env.PUPPETEER_REMOTE_URL,
        });

        defer(() => {
            log.info('Disconnecting from remote browser...');
            browser.disconnect();
        });
    } else {
        log.info('Launching local browser...');

        browser = await puppeteer.launch({
            executablePath: env.PUPPETEER_EXECUTABLE_PATH,
            userDataDir: env.PUPPETEER_DATA_PATH ?? nodePath.join(process.cwd(), './data'),
            args: env.PUPPETEER_ARGS,
            handleSIGINT: false,
            handleSIGTERM: false,
        });

        defer(async () => {
            log.info('Closing local browser...');
            await browser.close();
        });
    }

    log.info('Processing requests...');

    await processRequests(
        {
            prisma,
            redis,
            log,
        },
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
            await redis.client.setex(`${ redis.prefix }:${ ref }`, 120, screenshot);

            return {
                ref,
                width: rect.width,
                height: rect.height,
            };
        }),
        {
            abortSignal,
            concurrency: 16,
            cacheTimeout: 60,
        },
    );

    log.info('Done!');
    return 0;
});
