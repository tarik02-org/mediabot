import chalk from 'chalk';
import prompts from 'prompts';

import { prisma } from '../../prisma.js';

import { authorizeGmail } from './gmail.js';

const { username } = await prompts({
    type: 'text',
    name: 'username',
    message: 'Instagram username',
});

const { password } = await prompts({
    type: 'password',
    name: 'password',
    message: 'Instagram password',
});

const { gmailTwoFactorEnabled } = await prompts({
    type: 'toggle',
    name: 'gmailTwoFactorEnabled',
    message: 'Enable two factor auth?',
});

let gmailTwoFactorAuthData = undefined;

if (gmailTwoFactorEnabled) {
    const { clientId } = await prompts({
        type: 'text',
        name: 'clientId',
        message: 'Gmail auth client id',
    });

    const { clientSecret } = await prompts({
        type: 'password',
        name: 'clientSecret',
        message: 'Gmail auth client secret',
    });

    const { redirectUri } = await prompts({
        type: 'text',
        name: 'redirectUri',
        message: 'Gmail auth redirect uri',
    });

    gmailTwoFactorAuthData = await authorizeGmail({
        clientId,
        clientSecret,
        redirectUri,

        askAuth: async (url: string) => {
            process.stdout.write('\n');
            process.stdout.write(`Visit this URL: ${ chalk.blue(url) }\n`);
            process.stdout.write('Enter the url of redirected page here.\n');
            process.stdout.write('\n');

            const { url: resultUrl } = await prompts({
                type: 'text',
                name: 'url',
                message: 'URL',
            });

            return resultUrl;
        },
    });
}

await prisma.instagramParserAccount.create({
    data: {
        username,
        password,
        gmailTwoFactorAuthData,
        isActive: true,
    },
});
