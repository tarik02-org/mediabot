import { EmbedBuilder, SlashCommandBuilder } from '@discordjs/builders';
import { APIEmbed, InteractionsAPI, WebhooksAPI } from '@discordjs/core';
import { REST } from '@discordjs/rest';
import { WebSocketManager } from '@discordjs/ws';
import * as Sentry from '@sentry/core';
import { AttachmentBuilder, Client, Events, GatewayDispatchEvents, GatewayIntentBits, IntentsBitField, Interaction, InteractionType, MessageFlags, RawFile } from 'discord.js';
import * as radash from 'radash';
import { z } from 'zod';

import * as instagramResolver from '../../../src/app/parser-instagram/api';
import * as redditResolver from '../../../src/app/parser-reddit/api';
import * as tiktokResolver from '../../../src/app/parser-tiktok/api';
import * as twitterResolver from '../../../src/app/parser-twitter/api';
import * as ytdlpResolver from '../../../src/app/parser-ytdlp/api';
import * as renderResolver from '../../../src/app/render/api';
import { log } from '../../../src/log';
import { prisma } from '../../../src/prisma';
import { bindCallback, createCallback, processCallbacks, submitRequest } from '../../../src/resolvers/lib';
import { useSignalHandler } from '../../../src/utils/signalHandler';
import { sleep } from '../../../src/utils/sleep';

const env = {
    SERVICE_NAME: 'test',
};

const matchers = [
    instagramResolver.matcher,
    redditResolver.matcher,
    tiktokResolver.matcher,
    twitterResolver.matcher,
    ...ytdlpResolver.matchers,
] as const;

const contextSchema = z.union([
    z.object({
        type: z.literal('interaction'),
        id: z.string(),
        token: z.string(),
    }),
    z.object({
        type: z.literal(''),
    }),
]);

export const processorCallback = createCallback(
    `${ env.SERVICE_NAME }-processor`,
    contextSchema,
    [
        instagramResolver.processor,
        redditResolver.processor,
        tiktokResolver.processor,
        twitterResolver.processor,
        ytdlpResolver.processor,
    ] as const,
);

const reportError = (error: any, context?: string) => {
    log.error(error, context);
    Sentry.captureException(error);
};

const spawn = async (fn: () => Promise<void>) => {
    fn().catch(reportError);
};

await radash.defer(async defer => {
    const abortController = new AbortController();
    defer(() => abortController.abort());

    defer(
        useSignalHandler(() => abortController.abort()),
    );

    const applicationId = '1006622030608728094';
    const token = 'MTAwNjYyMjAzMDYwODcyODA5NA.GPdKIS.5HVD086C3fPbWAtSH6nDuocenSNDg8NfTn49hU';

    // const rest = new REST({ version: '10' }).setToken(token);

    // const gateway = new WebSocketManager({
    //     token,
    //     intents: GatewayIntentBits.DirectMessages | GatewayIntentBits.MessageContent,
    //     rest,
    // });

    const client = new Client({
        intents: [
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.MessageContent,
        ],
    });

    const webhooksApi = new WebhooksAPI(client.rest);
    const interactionsApi = new InteractionsAPI(client.rest, webhooksApi);

    client.once(Events.ClientReady, () => {
        log.info('Client is ready', { tag: client.user!.tag });
    });

    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isChatInputCommand()) {
            return;
        }

        await interaction.deferReply();

        const query = interaction.options.getString('url', true);

        for (const matcher of [
            ...matchers,
            ytdlpResolver.anyLinkMatcher,
        ]) {
            for (const regex of matcher.regex) {
                const match = query.match(regex);
                if (match === null) {
                    continue;
                }

                const matcherQuery = matcher.prepareQuery(match);

                const request = await submitRequest(
                    matcher.processor,
                    matcherQuery,
                    bindCallback(processorCallback, {
                        type: 'interaction',
                        id: interaction.id,
                        token: interaction.token,
                    }),
                    {
                        source: 'DISCORD',
                    },
                );

                await prisma.discordRequest.create({
                    data: {
                        query,
                        request: {
                            connect: { id: request.id },
                        },
                    },
                });
            }
        }
    });

    const command = new SlashCommandBuilder()
        .setName('save')
        .setDescription('Send photo or video from URL')
        .addStringOption(option => option
            .setName('url')
            .setDescription('URL')
            .setRequired(true),
        );

    await client.application?.commands.set([
        command,
    ]);

    defer(() => client.destroy());

    await client.login(token);

    log.info('Bot is running');

    const makeReply = async (
        context: z.TypeOf<typeof contextSchema>,
        title: string | null,
        url: string | null,
        items: (
            | {
                type: 'photo',
                name: string,
                data: Buffer,
                size?: {
                    width: number,
                    height: number
                }
            }
            | {
                type: 'gif',
                name: string,
                data: Buffer,
                size?: {
                    width: number,
                    height: number
                }
            }
            | {
                type: 'video',
                name: string,
                data: Buffer,
                size?: {
                    width: number,
                    height: number
                },
                duration?: number
            }
        )[],
    ) => {
        switch (context.type) {
            case 'interaction': {
                const mappedItems: Array<{
                    file: RawFile,
                    embed: APIEmbed
                }> = items.map(item => {
                    return {
                        file: {
                            name: item.name,
                            data: item.data,
                        },
                        embed: {
                            video: {
                                url: `attachment://${ item.name }`,
                            },
                        } satisfies APIEmbed,
                    };
                });

                const files = mappedItems.map(item => item.file);
                const embeds = mappedItems.map(item => item.embed);

                await interactionsApi.editReply(
                    applicationId,
                    context.token,
                    {
                        content: 'Hello World',
                        files,
                        embeds,
                    },
                );
                break;
            }
        }
    };

    await Promise.allSettled([
        sleep(Infinity, abortController.signal),

        (async () => {
            for await (const item of processCallbacks(processorCallback, { abortSignal: abortController.signal })) {
                log.debug(item, 'Processing callback');

                spawn(async () => {
                    if ('error' in item) {
                        console.log(item);
                        return;
                    }

                    try {
                        switch (item.name) {
                            case 'reddit':
                                    await makeReply(
                                        item.context
                                    );
                                    // client.ws
                                    // item.context.id
                                    // client.
                                break;
                        }
                    } catch (error: any) {
                        reportError(error, 'Failed to process callback');

                        // await replyNotFound(item.context);
                    }
                });
            }
        })(),
    ]);
});
