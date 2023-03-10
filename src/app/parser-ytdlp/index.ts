import '../../env.js';

import { execa } from 'execa';
import * as nodeFs from 'node:fs/promises';
import * as nodeProcess from 'node:process';
import * as radash from 'radash';
import * as uuid from 'uuid';
import { z } from 'zod';

import { log } from '../../log.js';
import { redis, redisPrefix } from '../../redis.js';
import { processRequests } from '../../resolvers/lib.js';

import { processor } from './api.js';

type Result = z.infer<(typeof processor)['resultSchema']>;

const env = z.object({
    YTDLP_PATH: z.string(),
}).parse(
    process.env,
);

await processRequests(
    processor,
    async ({ key, source }) => await radash.defer(async defer => {
        log.debug({ source }, 'processing');

        const tmpDir = `${ nodeProcess.cwd() }/tmp/${ key.replace(/\//g, '+') }`;
        await nodeFs.mkdir(tmpDir, { recursive: true });
        defer(async () => nodeFs.rm(tmpDir, { recursive: true, force: true }));

        const process = await execa(env.YTDLP_PATH, [
            '--no-playlist',
            // '--dump-single-json',
            // '--no-simulate',
            '--print-json',
            '--no-progress',
            '-f', '(b[ext=mp4])[filesize<50M]/(bv[ext=mp4]+ba[ext=m4a])[filesize<50M]/b/bv',
            '-o', '%(title).200s.%(ext)s',
            source,
        ], {
            cwd: tmpDir,
            stdout: 'pipe',
            stderr: 'pipe',
        });

        if (process.exitCode !== 0) {
            log.error({
                exitCode: process.exitCode,
                stdout: process.stdout,
                stderr: process.stderr,
            }, 'ytdlp failed');

            throw new Error('ytdlp failed');
        }

        const rawOutput = JSON.parse(process.stdout);

        log.debug({
            output: rawOutput,
        }, 'ytdlp output');

        const output = z.object({
            title: z.string(),
            webpage_url: z.string(),

            filename: z.string(),

            width: z.number().optional(),
            height: z.number().optional(),
            duration: z.number().optional(),
        }).parse(
            rawOutput,
        );

        const videoId = uuid.v4();
        const ref = `ytdlp:video:${ videoId }`;

        await redis.setex(
            `${ redisPrefix }:${ ref }`, 120,
            await nodeFs.readFile(`${ tmpDir }/${ output.filename }`),
        );

        return {
            title: output.title,
            url: output.webpage_url,

            media: [
                {
                    type: 'video',
                    ref,
                    size: output.width && output.height
                        ? {
                            width: output.width,
                            height: output.height,
                        }
                        : undefined,
                    duration: output.duration,
                },
            ],
        } satisfies Result;
    }),
    {
        concurrency: 16,
        cacheTimeout: 60,
    },
);
