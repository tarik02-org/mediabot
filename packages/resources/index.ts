import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

export const resourcesPath = nodePath.join(
    nodePath.dirname(fileURLToPath(new URL(import.meta.url))),
    'assets',
);

export const resourcePath = (path: string): string => nodePath.join(resourcesPath, path);
