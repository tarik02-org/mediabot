import Got from 'got';
import { JSDOM } from 'jsdom';
import innerText from 'styleless-innertext';
import { CookieJar } from 'tough-cookie';
import { redis } from '../../redis.js';
import { Query } from './index.js';

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/110.0';
const DEFAULT_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Alt-Used': 'musicaldown.com',
    'Cache-Control': 'no-cache',
    'DNT': '1',
    'Pragma': 'no-cache',
    'Origin': 'https://musicaldown.com',
    'Referer': 'https://musicaldown.com/en/',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'TE': 'trailers'
};

export const downloadFromMusicaldown = async (query: Query) => {
    const cookieJar = new CookieJar();

    const got = Got.extend({
        cookieJar
    });

    const inputs = await (async () => {
        const dom = new JSDOM(
            await got('https://musicaldown.com/en', {
                headers: {
                    'User-Agent': USER_AGENT
                }
            }).text()
        );

        return dom.window.document.querySelectorAll<HTMLInputElement>('input');
    })();

    const dom = new JSDOM(
        await got.post('https://musicaldown.com/download', {
            form: {
                [ inputs[ 0 ].name ]: query.source,
                [ inputs[ 1 ].name ]: inputs[ 1 ].value,
                [ inputs[ 2 ].name ]: inputs[ 2 ].value
            },
            headers: {
                ...DEFAULT_HEADERS
            },
            followRedirect: false
        }).text()
    );

    const [ author, description ] = Array.from(
        dom.window.document.querySelectorAll<HTMLHeadingElement>('h2.white-text'),
        el => innerText(el)
    );

    const url = dom.window.document.querySelectorAll<HTMLAnchorElement>('a.btn.waves-effect.waves-light.orange')[ 1 ].href;

    return {
        title: description,
        url: query.source,

        downloadVideo: async () => await got.get(url, {
            headers: {
                ...DEFAULT_HEADERS
            },
            followRedirect: false
        }).buffer()
    };
};
