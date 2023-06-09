import { defineConfig } from 'vite';

export default defineConfig({
    optimizeDeps: {
        disabled: true,
    },
    ssr: {
        external: [
            '@mediabot/prisma',
            'twing',
        ],
    },
});
