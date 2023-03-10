import { ExtraPluginProxyRouter } from '@extra/proxy-router';
import puppeteerVanilla from 'puppeteer';
import { PuppeteerExtra } from 'puppeteer-extra';
import { default as AnonymizeUAPlugin } from 'puppeteer-extra-plugin-anonymize-ua';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

export const createPuppeteer = async ({
    proxy,
}: {
    proxy?: string
}) => {
    const puppeteer = new PuppeteerExtra(puppeteerVanilla);

    puppeteer.use(StealthPlugin());
    puppeteer.use((AnonymizeUAPlugin as any)());

    if (proxy !== undefined) {
        puppeteer.use(new ExtraPluginProxyRouter({
            proxies: {
                DEFAULT: proxy,
            },
        }));
    }

    return puppeteer;
};
