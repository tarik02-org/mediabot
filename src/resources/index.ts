import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

export const resourcesPath = nodePath.join(
    nodePath.dirname(fileURLToPath(new URL(import.meta.url))),
    '../../resources',
);
