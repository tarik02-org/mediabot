import { z } from 'zod';

export enum RawMediaType {
    PHOTO = 1,
    VIDEO = 2,
    CAROUSEL = 8,
}

export const RawMediaSchemaBase = z.object({
    pk: z.string(),
    caption: z.object({
        text: z.string(),
    }).optional(),
});

export const RawMediaSchemaPhoto = z.intersection(RawMediaSchemaBase, z.object({
    media_type: z.literal(RawMediaType.PHOTO),
    image_versions2: z.object({
        candidates: z.array(z.object({
            url: z.string(),
        })),
    }),
}));

export const RawMediaSchemaVideo = z.intersection(RawMediaSchemaBase, z.object({
    media_type: z.literal(RawMediaType.VIDEO),
    video_versions: z.array(z.object({
        url: z.string(),
    })),
}));

export const RawMediaSchemaCarousel = z.intersection(RawMediaSchemaBase, z.object({
    media_type: z.literal(RawMediaType.CAROUSEL),
    carousel_media: z.array(z.union([
        RawMediaSchemaPhoto,
        RawMediaSchemaVideo,
    ])),
}));

export const RawMediaSchema = z.union([
    RawMediaSchemaPhoto,
    RawMediaSchemaVideo,
    RawMediaSchemaCarousel,
]);
