#!/usr/bin/env -S node --no-warnings --experimental-specifier-resolution=node --loader=ts-node/esm

if (process.env.SENTRY_DSN !== undefined) {
    const Sentry = await import('@sentry/node');

    await import('@sentry/tracing');

    Sentry.init({
        dsn: process.env.SENTRY_DSN,
    });
}

const [ moduleSpecifier ] = process.argv.splice(2, 1);

const abortController = new AbortController();

const signals = {
    SIGINT: 2,
    SIGUSR2: 31,
    SIGTERM: 15,
} as const;

const onInterrupt = (signal: 'SIGINT' | 'SIGTERM') => {
    if (abortController.signal.aborted) {
        uninstallInterruptHandler();
        // the usual way to exit with a signal is to add 128 to the signal number
        const exitCode = signals[ signal ] + 128;
        process.exit(exitCode);
    }

    abortController.abort();
};
const installInterruptHandler = () => {
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onInterrupt);
};
const uninstallInterruptHandler = () => {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onInterrupt);
};

installInterruptHandler();

const mainModule = await import(moduleSpecifier);

try {
    process.exit(
        await mainModule.main(process, abortController.signal),
    );
} finally {
    abortController.abort();
}
