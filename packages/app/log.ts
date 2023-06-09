import { pino } from 'pino';

export const createDefaultLogger = () => pino({
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
        },
    },
    level: 'debug',
});
