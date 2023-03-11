if (process.env.MEDIABOT_WORKDIR !== undefined) {
    process.chdir(process.env.MEDIABOT_WORKDIR);
}

await import('dotenv/config');

if (process.env.MEDIABOT_SENTRY_DSN !== undefined) {
    const Sentry = await import('@sentry/node');

    await import('@sentry/tracing');

    Sentry.init({
        dsn: process.env.MEDIABOT_SENTRY_DSN,
    });
}
