import Redis from 'ioredis';
import { default as Redlock } from 'redlock';

export type RedisManager = {
    client: Redis,
    redlock: Redlock,
    prefix: string,
};

export const createRedisManager = ({
    url,
    prefix,
}: {
    url: string,
    prefix: string,
}): RedisManager => {
    const client = new Redis(url);

    const redlock = new Redlock([ client ]);

    return {
        client,
        redlock,
        prefix,
    };
};
