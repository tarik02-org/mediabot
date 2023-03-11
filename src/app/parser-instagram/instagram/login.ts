import { Browser, ElementHandle, TimeoutError } from 'puppeteer';
import * as radash from 'radash';
import sleep from 'sleep-promise';

import { log } from '../../../log.js';

export const login = async (
    browser: Browser,
    {
        username,
        password,
        resolveVerificationCode,
    }: {
        username: string,
        password: string,
        resolveVerificationCode: () => Promise<string>
    },
) => radash.defer(async defer => {
    const page = await browser.newPage();
    defer(async () => await page.close({
        runBeforeUnload: false,
    }));

    await page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'networkidle2',
    });

    if ((new URL(page.url())).pathname.startsWith('/challenge/')) {
        if ((await page.$x('//*[text()="We Detected An Unusual Login Attempt"]')).length > 0) {
            ((
                await page.$x('//button[text()="This Was Me"]')
            )[ 0 ] as ElementHandle<HTMLButtonElement>)!.click();

            await page.waitForNavigation({
                waitUntil: 'networkidle2',
            });
        }
    }

    if (!(new URL(page.url())).pathname.startsWith('/accounts/login/')) {
        log.info('Already logged in. Skipping login.');
        return;
    }

    log.info('Logging in.');

    await sleep(300);

    await (await page.waitForXPath('//form[@id="loginForm"]//input[@name="username"]'))!.type(username);

    await sleep(300);

    await (await page.waitForXPath('//form[@id="loginForm"]//input[@name="password"]'))!.type(password);

    await sleep(400);

    const submitButton = (
        await page.waitForXPath('//form[@id="loginForm"]//button[@type="submit"]')
    ) as ElementHandle<HTMLButtonElement>;

    log.debug('Clicking submit button...');

    await Promise.all([
        page.waitForNavigation({
            waitUntil: 'networkidle2',
            timeout: 60000,
        }),
        submitButton.click({ delay: 30 }),
    ]);

    if ((new URL(page.url())).pathname.startsWith('/challenge/action/')) {
        const $sendSecurityCodeButtons = await page.$x('//button[text()="Send Security Code"]');

        if ($sendSecurityCodeButtons.length > 0) {
            log.info('Asking for security code.');

            await (
                $sendSecurityCodeButtons[ 0 ] as ElementHandle<HTMLButtonElement>
            ).click();
        }

        log.info('Resolving security code...');
        const verificationCode = await resolveVerificationCode();
        log.info(`Got security code: ${ verificationCode }`);

        (await page.waitForXPath('//input[@name="security_code"]'))!.type(
            verificationCode,
        );

        ((
            await page.$x('//form//button[text()="Submit"]')
        )[ 0 ] as ElementHandle<HTMLButtonElement>)!.click();

        await sleep(1000);

        await page.waitForNavigation({
            waitUntil: 'networkidle2',
        });
    }

    try {
        const button = await page.waitForXPath('//button[@type="button"][text()="Save Info"]', {
            timeout: 10 * 1000,
        });

        await (button! as ElementHandle<HTMLButtonElement>).click();

        await sleep(2000);
    } catch (e) {
        if (e instanceof TimeoutError) {
            log.info('No "Save Info" button found. Skipping.');
        }
    }

    log.info('Login flow done.');
});
