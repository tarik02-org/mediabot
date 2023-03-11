import '../../env.js';

import Sentry from '@sentry/core';
import fastify from 'fastify';
import { InputFile, webhookCallback } from 'grammy';
import { InputMediaAnimation, InputMediaPhoto, InputMediaVideo } from 'grammy/types';
import * as nodePath from 'node:path';
import { pathToFileURL } from 'node:url';
import * as uuid from 'uuid';
import { z } from 'zod';

import { cache } from '../../cache.js';
import { log } from '../../log.js';
import { redis, redisPrefix } from '../../redis.js';
import { bindCallback, createCallback, processCallbacks, submitRequest } from '../../resolvers/lib.js';
import { resourcesPath } from '../../resources/index.js';
import { twing } from '../../resources/views.js';
import { telegram } from '../../telegram.js';
import * as instagramResolver from '../parser-instagram/api.js';
import * as redditResolver from '../parser-reddit/api.js';
import * as tiktokResolver from '../parser-tiktok/api.js';
import * as twitterResolver from '../parser-twitter/api.js';
import * as ytdlpResolver from '../parser-ytdlp/api.js';
import * as renderResolver from '../render/api.js';

import { env } from './env.js';
import { getAccountByUser } from './getAccountByUser.js';
import { mapTwitterMedia } from './twitter.js';
import { uploadFileToTelegram } from './uploadFileToTelegram.js';

const matchers = [
    instagramResolver.matcher,
    redditResolver.matcher,
    tiktokResolver.matcher,
    twitterResolver.matcher,
    ...ytdlpResolver.matchers,
] as const;

const contextSchema = z.union([
    z.object({
        type: z.literal('chat'),
        chatId: z.number(),
        messageId: z.number().optional(),
        requiresReply: z.boolean(),
    }),
    z.object({
        type: z.literal('inline'),
        inlineMessageId: z.string(),
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

export const twitterRenderCallback = createCallback(
    `${ env.SERVICE_NAME }-twitter-render`,
    z.intersection(
        contextSchema,
        z.object({
            tweet: z.any(),
        }),
    ),
    [
        renderResolver.processor,
    ] as const,
);

await telegram.init();

const [
    clickToSendFileId,
    notFoundFileId,
    loadingFileId,
] = await Promise.all([
    cache.get(
        'telegram:resources:click-to-send',
        1000 * 60 * 60 * 24,
        z.string(),
        async () => (await uploadFileToTelegram(
            pathToFileURL(nodePath.join(resourcesPath, 'telegram/click-to-send.png')),
            'photo',
        )).file_id,
    ),
    cache.get(
        'telegram:resources:not-found',
        1000 * 60 * 60 * 24,
        z.string(),
        async () => (await uploadFileToTelegram(
            pathToFileURL(nodePath.join(resourcesPath, 'telegram/not-found.png')),
            'photo',
        )).file_id,
    ),
    cache.get(
        'telegram:resources:loading',
        1000 * 60 * 60 * 24,
        z.string(),
        async () => (await uploadFileToTelegram(
            pathToFileURL(nodePath.join(resourcesPath, 'telegram/loading.jpg')),
            'photo',
        )).file_id,
    ),
]);

telegram.on('inline_query', async ctx => {
    const { query, from } = ctx.inlineQuery;

    const prefetch = async () => {
        const telegramAccount = await getAccountByUser(from);

        for (const matcher of matchers) {
            for (const regex of matcher.regex) {
                const match = query.match(regex);
                if (match === null) {
                    continue;
                }

                const matcherQuery = matcher.prepareQuery(match);

                await submitRequest(
                    matcher.processor,
                    matcherQuery,
                    undefined,
                    {
                        telegramAccount: {
                            connect: { id: telegramAccount.id },
                        },
                    },
                );

                return;
            }
        }
    };

    await Promise.all([
        prefetch(),
        ctx.answerInlineQuery([
            {
                type: 'photo',
                id: uuid.v4(),
                title: ctx.inlineQuery.query,
                photo_file_id: clickToSendFileId,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: 'Loading...',
                                callback_data: 'loading',
                            },
                        ],
                    ],
                },
            },
        ], {
            cache_time: 0,
            is_personal: true,
        }),
    ]);
});

telegram.on('message', async ctx => {
    log.debug(ctx.message, 'Received message');

    if (!ctx.message.text) {
        return;
    }

    const telegramAccount = await getAccountByUser(ctx.message.from);

    const { query, replyToId, isImplicit } = ctx.message.chat.type === 'private'
        ? {
            query: ctx.message.text,
            replyToId: undefined,
            isImplicit: false,
        }
        : ctx.message.text.indexOf(`@${ telegram.botInfo.username }`) !== -1
            ? (ctx.message.reply_to_message && ctx.message.text.trim() === `@${ telegram.botInfo.username }` && 'text' in ctx.message.reply_to_message
                ? {
                    query: ctx.message.reply_to_message.text ?? '',
                    replyToId: ctx.message.reply_to_message.message_id,
                    isImplicit: false,
                }
                : {
                    query: ctx.message.text,
                    replyToId: ctx.message.message_id,
                    isImplicit: false,
                }
            )
            : {
                query: ctx.message.text,
                replyToId: ctx.message.message_id,
                isImplicit: true,
            };

    try {
        for (const matcher of matchers) {
            for (const regex of matcher.regex) {
                const match = query.match(regex);
                if (match === null) {
                    continue;
                }

                const matcherQuery = matcher.prepareQuery(match);

                await submitRequest(
                    matcher.processor,
                    matcherQuery,
                    bindCallback(processorCallback, {
                        type: 'chat',
                        chatId: ctx.message.chat.id,
                        messageId: replyToId,
                        requiresReply: !isImplicit,
                    }),
                    {
                        telegramAccount: {
                            connect: { id: telegramAccount.id },
                        },
                    },
                );

                return;
            }
        }
    } catch (e) {
        log.error(e);
    }

    await replyNotFound({
        type: 'chat',
        chatId: ctx.message.chat.id,
        messageId: ctx.message.message_id,
        requiresReply: !isImplicit,
    });
});

telegram.on('chosen_inline_result', async ctx => {
    log.debug(ctx.chosenInlineResult, 'Received chosen inline result');

    const { query, from } = ctx.chosenInlineResult;

    const telegramAccount = await getAccountByUser(from);

    await ctx.api.editMessageMediaInline(
        ctx.chosenInlineResult.inline_message_id!,
        {
            type: 'photo',
            media: loadingFileId,
        },
    );

    try {
        for (const matcher of matchers) {
            for (const regex of matcher.regex) {
                const match = query.match(regex);
                if (match === null) {
                    continue;
                }

                const matcherQuery = matcher.prepareQuery(match);

                await submitRequest(
                    matcher.processor,
                    matcherQuery,
                    bindCallback(processorCallback, {
                        type: 'inline',
                        inlineMessageId: ctx.chosenInlineResult.inline_message_id!,
                    }),
                    {
                        telegramAccount: {
                            connect: { id: telegramAccount.id },
                        },
                    },
                );

                return;
            }
        }
    } catch (e) {
        log.error(e);
    }

    await replyNotFound({
        type: 'inline',
        inlineMessageId: ctx.chosenInlineResult.inline_message_id!,
    });
});

log.info('Starting Telegram bot...');

telegram.catch(
    err => {
        Sentry.captureException(err);
        log.error(err);
    },
);

switch (env.BOT_MODE) {
    case 'polling':
        telegram.start();
        break;

    case 'webhook': {
        const app = fastify({
            logger: true,
        });

        app.get('/health', async () => {
            return {
                status: 'ok',
            };
        });

        app.all(
            env.BOT_WEBHOOK_PATH,
            webhookCallback(telegram, 'fastify'),
        );

        app.listen({
            host: '0.0.0.0',
            port: env.BOT_WEBHOOK_PORT,
        });

        log.info(`Starting Telegram bot webhook server on port ${ env.BOT_WEBHOOK_PORT }...`);
        break;
    }
}

const processDefaultMediaCallback = async (
    context: z.TypeOf<typeof contextSchema>,
    title: string | null,
    url: string | null,
    items: (
        | {
            type: 'photo',
            url: string | InputFile,
            size?: {
                width: number,
                height: number
            }
        }
        | {
            type: 'video',
            url: string | InputFile,
            size?: {
                width: number,
                height: number
            },
            duration?: number
        }
    )[],
) => {
    const caption = title !== null || url !== null
        ? [ title, url ].filter(Boolean).join('\n\n').substring(0, 1024)
        : undefined;

    switch (context.type) {
        case 'chat': {
            const inputMedia: Array<InputMediaPhoto | InputMediaVideo> = items.map(media => {
                switch (media.type) {
                    case 'photo':
                        return {
                            type: 'photo',
                            media: media.url,
                        } satisfies InputMediaPhoto;

                    case 'video':
                        return {
                            type: 'video',
                            media: media.url,

                            ...media.size !== undefined
                                ? { width: media.size.width, height: media.size.height }
                                : {},

                            duration: media.duration,
                        } satisfies InputMediaVideo;
                }
            });

            const chunks: Array<Array<InputMediaPhoto | InputMediaVideo> | InputMediaAnimation> = [];
            let currentChunk: Array<InputMediaPhoto | InputMediaVideo> = [];
            for (const item of inputMedia) {
                if (item.type === 'photo' || item.type === 'video') {
                    currentChunk.push(item);
                    if (currentChunk.length === 10) {
                        chunks.push(currentChunk);
                        currentChunk = [];
                    }
                    continue;
                }

                if (currentChunk.length !== 0) {
                    chunks.push(currentChunk);
                    currentChunk = [];
                }

                chunks.push(item);
            }
            if (currentChunk.length !== 0) {
                chunks.push(currentChunk);
                currentChunk = [];
            }

            for (const chunk of chunks) {
                if (chunk instanceof Array) {
                    await telegram.api.sendMediaGroup(
                        context.chatId,
                        [
                            {
                                ...chunk[ 0 ],
                                caption,
                            },
                            ...chunk.slice(1),
                        ],
                        {
                            reply_to_message_id: context.messageId,
                        },
                    );
                } else {
                    const { type, media, ...extra } = chunk;
                    await telegram.api.sendAnimation(
                        context.chatId,
                        media,
                        {
                            ...extra,
                            caption,
                            reply_to_message_id: context.messageId,
                        },
                    );
                }
            }
            break;
        }

        case 'inline': {
            const media = items[ 0 ];

            switch (media.type) {
                case 'photo': {
                    let file = media.url;

                    if (typeof file !== 'string') {
                        const temporaryMessage = await telegram.api.sendPhoto(env.TEMPORARY_CHAT_ID, file);

                        telegram.api.deleteMessage(env.TEMPORARY_CHAT_ID, temporaryMessage.message_id).catch(
                            error => log.error(error, 'Failed to delete temporary message'),
                        );

                        file = temporaryMessage.photo[ 0 ].file_id;
                    }

                    await telegram.api.editMessageMediaInline(context.inlineMessageId, {
                        type: 'photo',
                        media: media.url,
                        caption,
                    });
                    break;
                }

                case 'video': {
                    let file = media.url;

                    if (typeof file !== 'string') {
                        const temporaryMessage = await telegram.api.sendVideo(env.TEMPORARY_CHAT_ID, file);

                        telegram.api.deleteMessage(env.TEMPORARY_CHAT_ID, temporaryMessage.message_id).catch(
                            error => log.error(error, 'Failed to delete temporary message'),
                        );

                        file = temporaryMessage.video.file_id;
                    }

                    await telegram.api.editMessageMediaInline(context.inlineMessageId, {
                        type: 'video',
                        media: file,
                        caption,
                        duration: media.duration,
                        ...media.size,
                        supports_streaming: true,
                    });
                    break;
                }
            }
            break;
        }
    }
};

const replyNotFound = async (ctx: z.TypeOf<typeof contextSchema>) => {
    switch (ctx.type) {
        case 'chat':
            if (ctx.requiresReply) {
                await telegram.api.sendMessage(ctx.chatId, 'Not found', {
                    reply_to_message_id: ctx.messageId,
                });
            }
            break;

        case 'inline':
            await telegram.api.editMessageMediaInline(ctx.inlineMessageId, {
                type: 'photo',
                media: notFoundFileId,
            });
            break;
    }
};

const spawn = async (fn: () => Promise<void>) => {
    fn().catch(
        error => log.error(error),
    );
};

(async () => {
    for await (const item of processCallbacks(processorCallback)) {
        log.debug(item, 'Processing callback');

        spawn(async () => {
            if ('error' in item) {
                await replyNotFound(item.context);
                return;
            }

            try {
                switch (item.name) {
                    case 'instagram':
                        await processDefaultMediaCallback(
                            item.context,
                            item.result.title,
                            item.result.url,
                            item.result.media,
                        );
                        break;

                    case 'reddit':
                        await processDefaultMediaCallback(
                            item.context,
                            item.result.title,
                            item.result.url,
                            item.result.media,
                        );
                        break;

                    case 'tiktok':
                        await processDefaultMediaCallback(
                            item.context,
                            item.result.title,
                            item.result.url,
                            [
                                {
                                    type: 'video',
                                    url: new InputFile(
                                        (await redis.getBuffer(`${ redisPrefix }:${ item.result.video.ref }`))!,
                                        'tiktok.mp4',
                                    ),
                                    size: item.result.video.size,
                                    duration: item.result.video.duration,
                                },
                            ],
                        );
                        break;

                    case 'twitter': {
                        const { chain, status } = item.result;

                        if (item.context.type === 'inline' && status.extended_entities?.media) {
                            const media = status.extended_entities?.media[ 0 ];

                            await processDefaultMediaCallback(
                                item.context,
                                status.full_text,
                                `https://twitter.com/${ status.user.screen_name }/status/${ status.id_str }`,
                                [
                                    mapTwitterMedia(media),
                                ],
                            );
                        } else {
                            const content = await twing.render('twitter/preview.twig', {
                                chain,
                                tweet: status,
                            });

                            await submitRequest(
                                renderResolver.processor,
                                {
                                    content: Buffer.from(content).toString('base64'),
                                    selector: '#root',
                                },
                                bindCallback(twitterRenderCallback, {
                                    ...item.context,
                                    tweet: status,
                                }),
                            );
                        }
                        break;
                    }

                    case 'ytdlp': {
                        const { title, url, media } = item.result;

                        const mediaData = new Map<string, Buffer>();

                        await Promise.all(
                            media.map(async item => {
                                const buffer = await redis.getBuffer(`${ redisPrefix }:${ item.ref }`);
                                if (buffer === null) {
                                    throw new Error(`Media "${ item.ref }" not found`);
                                }

                                mediaData.set(
                                    item.ref,
                                    buffer,
                                );
                            }),
                        );

                        await processDefaultMediaCallback(
                            item.context,
                            title,
                            url,
                            media.map(({ ref, ...item }) => ({
                                ...item,
                                url: new InputFile(
                                    mediaData.get(ref)!,
                                ),
                            })),
                        );
                        break;
                    }
                }
            } catch (error) {
                log.error(error, 'Failed to process callback');

                await replyNotFound(item.context);
            }
        });
    }
})();

(async () => {
    for await (const item of processCallbacks(twitterRenderCallback)) {
        log.debug(item, 'Processing twitter callback');

        spawn(async () => {
            const { tweet } = item.context;

            try {
                await processDefaultMediaCallback(
                    item.context,
                    null,
                    `https://twitter.com/${ tweet.user.screen_name }/status/${ tweet.id_str }`,
                    [
                        {
                            type: 'photo',
                            url: new InputFile(
                                (await redis.getBuffer(`${ redisPrefix }:${ item.result.ref }`))!,
                                'image.png',
                            ),
                            size: {
                                width: item.result.width,
                                height: item.result.height,
                            },
                        },

                        ...(tweet.extended_entities?.media ?? []).map(
                            mapTwitterMedia,
                        ),
                    ],
                );
            } catch (error) {
                log.error(error, 'Failed to process twitter callback');

                await replyNotFound(item.context);
            }
        });
    }
})();
