import dotenv from 'dotenv';

if (process.env.MEDIABOT_WORKDIR !== undefined) {
    process.chdir(process.env.MEDIABOT_WORKDIR);
}

const { error, parsed } = dotenv.config();

if (error !== undefined) {
    throw error;
}

if (parsed!.MEDIABOT_SENTRY_DSN !== undefined) {
    const Sentry = await import('@sentry/node');

    await import('@sentry/tracing');

    Sentry.init({
        dsn: parsed!.MEDIABOT_SENTRY_DSN,
    });
}

export const getEnv = () => parsed!;
