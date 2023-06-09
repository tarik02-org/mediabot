import { parse } from 'dotenv';
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';

export const loadEnvFile = async (name: string) => {
    try {
        const contents = await fs.readFile(
            name,
            'utf-8',
        );

        return parse(contents);
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            return null;
        }

        throw e;
    }
};

export const loadEnv = async (
    sources: (string | Record<string, string | undefined>)[] = [
        '',
        process.env,
    ],
) => {
    const envs = await Promise.all(
        sources.map(source =>
            typeof source === 'string' ?
                loadEnvFile(
                    nodePath.resolve(source === '' ? '.env' : `.env.${ source }`),
                ) :
                Promise.resolve(source),
        ),
    );

    return Object.assign(
        {},
        ...envs.filter(Boolean),
    );
};
