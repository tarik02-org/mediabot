import { z } from 'zod';

import { createRequestMatcher, createRequestProcessor } from '../../resolvers/lib.js';

export const processor = createRequestProcessor(
    'ytdlp',
    z.object({
        key: z.string(),
        source: z.string(),
    }),
    z.object({
        title: z.string().nullable(),
        url: z.string().nullable(),
        media: z.array(z.union([
            z.object({
                type: z.literal('photo'),
                ref: z.string(),
            }),
            z.object({
                type: z.literal('video'),
                ref: z.string(),
                size: z.object({
                    width: z.number(),
                    height: z.number(),
                }).optional(),
                duration: z.number().optional(),
            }),
        ])),
    }),
    data => data.key,
);

export const youtubeMatcher = createRequestMatcher(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?(?<searchQuery>[^\s\n]+))/,
    match => {
        const searchParams = new URLSearchParams(match.groups!.searchQuery);
        const videoId = searchParams.get('v')!;

        return {
            key: `ytdlp/youtube/${ videoId }`,
            source: `https://www.youtube.com/watch?v=${ videoId }`,
        };
    },
    processor,
);

export const youtubeShortsMatcher = createRequestMatcher(
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/(?<id>[\w\-.]+)/,
    match => ({
        key: `ytdlp/youtube-shorts/${ match.groups!.id }`,
        source: `https://www.youtube.com/shorts/${ match.groups!.id }`,
    }),
    processor,
);

export const twitchClipMatcher = createRequestMatcher(
    /(?:https?:\/\/)?(?:www\.)?clips\.twitch\.tv\/(?<id>[\w\-.]+)/,
    match => ({
        key: `ytdlp/twitch-clip/${ match.groups!.id }`,
        source: `https://clips.twitch.tv/${ match.groups!.id }`,
    }),
    processor,
);

export const ninegagMatcher = createRequestMatcher(
    /(?:https?:\/\/)?(?:www\.)?9gag\.com\/gag\/(?<id>[\w\-.]+)/,
    match => ({
        key: `ytdlp/9gag/${ match.groups!.id }`,
        source: `https://9gag.com/gag/${ match.groups!.id }`,
    }),
    processor,
);

export const anyLinkMatcher = createRequestMatcher(
    /(?:https?:\/\/)?(?:[\w\-.]+)\/(?:[^\s\n]+)/,
    match => ({
        key: `ytdlp/any-link/${ match[ 0 ] }`,
        source: match[ 0 ],
    }),
    processor,
);

export const matchers = [
    // youtubeMatcher,
    youtubeShortsMatcher,
    twitchClipMatcher,
    ninegagMatcher,
] as const;
