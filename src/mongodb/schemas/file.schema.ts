import { Schema } from 'mongoose';

export const FileSchema = new Schema(
    { filename: { type: String, required: true } },
    { strict: false }
);
FileSchema.index({ filename: 1 }, { unique: true });

export const FileName = 'File';
