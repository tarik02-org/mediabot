import got from 'got';
import { InputFile } from 'grammy';
import { Document } from 'grammy/types';
import { createReadStream } from 'node:fs';
import * as nodePath from 'node:path';
import { Readable } from 'node:stream';

import { log, telegram } from '.';
import { env } from './env';

async function uploadFileToTelegram(
    from: URL,
    type?: 'document' | 'photo' | 'video' | 'sticker',
): Promise<Document>;
async function uploadFileToTelegram(
    from: Readable,
    filename: string,
    type?: 'document' | 'photo' | 'video' | 'sticker'
): Promise<Document>;
async function uploadFileToTelegram(
    from: Readable | URL,
    filename?: string,
    type: 'document' | 'photo' | 'video' | 'sticker' = 'document',
): Promise<Document> {
    if (from instanceof URL) {
        type = (filename as any) ?? 'document';
        filename = undefined;
    }

    const chatId = Number(env.TEMPORARY_CHAT_ID!);
    const data = from instanceof URL
        ? (
            from.protocol === 'file:'
                ? new InputFile(
                    createReadStream(from),
                    nodePath.basename(from.pathname),
                )
                : new InputFile(
                    got.stream(from),
                )
        )
        : new InputFile(
            from,
            filename,
        );

    let result: Document;

    switch (type) {
        case 'document': {
            const message = await telegram.api.sendDocument(chatId, data);

            telegram.api.deleteMessage(message.chat.id, message.message_id).catch(
                error => log.error(error),
            );

            result = message.document;
            break;
        }

        case 'photo': {
            const message = await telegram.api.sendPhoto(chatId, data);

            telegram.api.deleteMessage(message.chat.id, message.message_id).catch(
                error => log.error(error),
            );

            result = message.photo.slice(-1)[ 0 ];
            break;
        }

        case 'video': {
            const message = await telegram.api.sendVideo(chatId, data);

            telegram.api.deleteMessage(message.chat.id, message.message_id).catch(
                error => log.error(error),
            );

            result = message.video;
            break;
        }

        case 'sticker': {
            const message = await telegram.api.sendSticker(chatId, data);

            telegram.api.deleteMessage(message.chat.id, message.message_id).catch(
                error => log.error(error),
            );

            result = message.sticker;
            break;
        }
    }

    return result;
}

export { uploadFileToTelegram };
