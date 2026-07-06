import { Schema } from 'mongoose';

export const AlbumSchema = new Schema(
    { path: { type: String, required: true } },
    { strict: false }
);
AlbumSchema.index({ path: 1 }, { unique: true });

export const AlbumName = 'Album';
