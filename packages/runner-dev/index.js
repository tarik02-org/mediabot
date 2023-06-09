#!/usr/bin/env node
import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

import { useSignalHandler } from './signal-handler.js';

const [ moduleRequest ] = process.argv.splice(2, 1);

const abortController = new AbortController();

const removeSignalHandler = useSignalHandler(() => abortController.abort());
abortController.signal.addEventListener('abort', removeSignalHandler);

let stopCurrentApplication = () => Promise.resolve();

const vite = await createViteServer({
    configFile: nodePath.join(
        nodePath.dirname(fileURLToPath(import.meta.url)),
        'vite.config.ts',
    ),
    server: { middlewareMode: false },
    appType: 'custom',
    plugins: [
        {
            async handleHotUpdate() {
                await restartApplication();
            },
        },
    ],
});

abortController.signal.throwIfAborted();
abortController.signal.addEventListener('abort', () => vite.close());

async function restartApplication() {
    await stopCurrentApplication();

    const appAbortController = new AbortController();
    abortController.signal.addEventListener('abort', () => appAbortController.abort());

    // eslint-disable-next-line no-console
    console.log('Starting application');

    let promise = startApplication(appAbortController.signal);
    stopCurrentApplication = async () => {
        // eslint-disable-next-line no-console
        console.log('Stopping application');
        appAbortController.abort();
        await promise;
    };
}

async function startApplication(abortSignal) {
    try {
        const module = await vite.ssrLoadModule(
            moduleRequest,
        );
        abortController.signal.throwIfAborted();

        if (!('main' in module)) {
            // eslint-disable-next-line no-console
            console.error('Module does not export a main function');
        }

        await module.main(
            process,
            abortSignal,
        );
    } catch (e) {
        vite.ssrFixStacktrace(e);
        // eslint-disable-next-line no-console
        console.error(e);
    }
}

restartApplication();
