import { google } from 'googleapis';

import { sleep } from '@mediabot/utils/sleep';

import { log } from './deps';

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
];

export const authorizeGmail = async ({
    clientId,
    clientSecret,
    redirectUri,

    askAuth,
}: {
    clientId: string,
    clientSecret: string,
    redirectUri: string,

    askAuth: (url: string) => Promise<string>,
}) => {
    const oauth2 = new google.auth.OAuth2({
        clientId,
        clientSecret,
        redirectUri,
    });

    const url = await askAuth(
        oauth2.generateAuthUrl({
            scope: SCOPES,
            access_type: 'offline',
            response_type: 'code',
            prompt: 'consent',
        }),
    );

    const code = (new URL(url)).searchParams.get('code')!;

    const token = await oauth2.getToken(code);

    return {
        type: 'authorized_user',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token.tokens.refresh_token ?? undefined,
    };
};

export const createGmail = async ({
    credentials,
}: {
    credentials: {
        type: 'authorized_user',
        client_id: string,
        client_secret: string,
        refresh_token: string,
    },
}) => {
    const auth = google.auth.fromJSON(credentials);

    const gmail = google.gmail({
        version: 'v1',
        auth,
    });

    return {
        resolveVerifyCode: async () => {
            for (let i = 0; i < 10; i++) {
                await sleep(i * 1000);

                log.debug(`Trying to resolve verify code (attempt ${ i + 1 } of 10)`);

                const messages = await gmail.users.messages.list({
                    userId: 'me',
                    q: 'from:security@mail.instagram.com is:unread Verify your account',
                    maxResults: 1,
                });

                if (!messages.data.messages?.length) {
                    continue;
                }

                const messageId = messages.data.messages![ 0 ].id!;
                const message = await gmail.users.messages.get({
                    userId: 'me',
                    id: messageId,
                    format: 'full',
                });

                await gmail.users.messages.trash({
                    userId: 'me',
                    id: messageId,
                });

                const rawData = message.data.payload?.body?.data;
                if (rawData) {
                    const data = Buffer.from(rawData, 'base64').toString('utf-8');

                    const [ , code ] = data.match(/<font size="6">(\d{6})<\/font>/)!;

                    return code;
                }
            }

            log.warn('Failed to resolve verify code');

            return undefined;
        },
    };
};
