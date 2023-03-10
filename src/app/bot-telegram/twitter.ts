import got from 'got';
import { InputFile } from 'grammy';
import { z } from 'zod';

import { processor } from '../parser-twitter/api.js';

type Query = z.TypeOf<(typeof processor)['querySchema']>;
type Result = z.TypeOf<(typeof processor)['resultSchema']>;

export const mapTwitterMedia = (media: any) => {
    switch (media.type) {
        case 'photo':
            return {
                type: 'photo',
                url: media.media_url_https,
                size: media.original_info?.width && media.original_info?.height
                    ? {
                        width: media.original_info.width,
                        height: media.original_info.height,
                    }
                    : undefined,
            } as const;

        case 'video':
            return {
                type: 'video',
                url: new InputFile(
                    got.stream.get(
                        media.video_info.variants
                            .filter(
                                (variant: any) => variant.content_type === 'video/mp4',
                            )
                            .sort(
                                (a: any, b: any) => b.bitrate - a.bitrate,
                            )[ 0 ].url,
                    ),
                ),
                size: media.original_info?.width && media.original_info?.height
                    ? {
                        width: media.original_info.width,
                        height: media.original_info.height,
                    }
                    : undefined,
                duration: media.video_info.duration_millis
                    ? Math.round(media.video_info.duration_millis / 1000)
                    : undefined,
            } as const;

        default:
            throw new Error(`Unknown twitter media type: ${ media.type }`);
    }
};
