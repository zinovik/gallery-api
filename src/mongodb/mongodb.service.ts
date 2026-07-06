import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AlbumModel, FileModel } from '../common/album-file.types';
import { User } from './schemas/user.schema';
import { Cache } from './schemas/cache.schema';

@Injectable()
export class MongoDbService {
    constructor(
        @InjectModel('File') private fileModel: Model<FileModel>,
        @InjectModel('Album') private albumModel: Model<AlbumModel>,
        @InjectModel('User') private userModel: Model<User>,
        @InjectModel('Cache') private cacheModel: Model<Cache<unknown>>
    ) {}

    private MONGO_FIELD_REMOVED = {
        _id: 0,
        __v: 0,
    } as const;

    async getFiles(filenames?: string[]): Promise<FileModel[]> {
        const logMessage = this.buildLogMessage('getFiles', filenames);

        console.time(logMessage);

        const files = await this.fileModel
            .find(
                filenames?.length ? { filenames: { $in: filenames } } : {},
                this.MONGO_FIELD_REMOVED
            )
            .lean()
            .exec();

        console.timeEnd(logMessage);

        return files;
    }

    async upsertFiles(files: FileModel[]): Promise<void> {
        if (files.length === 0) {
            return;
        }

        await this.fileModel.bulkWrite(
            files.map((file) => ({
                updateOne: {
                    filter: { filename: file.filename },
                    update: { $set: file },
                    upsert: true,
                },
            })),
            { ordered: false }
        );
    }

    async removeFiles(filenames: string[]): Promise<void> {
        await this.fileModel.deleteMany({ filenames: { $in: filenames } });
    }

    async getAlbums(paths?: string[]): Promise<AlbumModel[]> {
        const logMessage = this.buildLogMessage('getAlbums', paths);

        console.time(logMessage);

        const albums = await this.albumModel
            .find(
                paths?.length ? { paths: { $in: paths } } : {},
                this.MONGO_FIELD_REMOVED
            )
            .lean()
            .exec();

        console.timeEnd(logMessage);

        return albums;
    }

    async upsertAlbums(albums: AlbumModel[]): Promise<void> {
        if (albums.length === 0) {
            return;
        }

        await this.albumModel.bulkWrite(
            albums.map((album) => ({
                updateOne: {
                    filter: { path: album.path },
                    update: { $set: album },
                    upsert: true,
                },
            })),
            { ordered: false }
        );
    }

    async removeAlbums(paths: string[]): Promise<void> {
        await this.albumModel.deleteMany({ paths: { $in: paths } });
    }

    async getUsers(emails?: string[]): Promise<User[]> {
        return this.userModel
            .find(
                emails?.length ? { emails: { $in: emails } } : {},
                this.MONGO_FIELD_REMOVED
            )
            .lean()
            .exec();
    }

    async getCaches<T>(cacheKeys: string[]): Promise<Cache<T>[]> {
        const logMessage = this.buildLogMessage('getCaches', cacheKeys);

        console.time(logMessage);

        const caches = await this.cacheModel
            .find({ cacheKey: { $in: cacheKeys } }, this.MONGO_FIELD_REMOVED)
            .lean()
            .exec();

        console.timeEnd(logMessage);

        return caches as Cache<T>[];
    }

    async upsertCaches<T>(
        caches: { cacheKey: string; data: T; expiresAt: Date }[]
    ): Promise<void> {
        await this.cacheModel.bulkWrite(
            caches.map((cache) => ({
                updateOne: {
                    filter: { cacheKey: cache.cacheKey },
                    update: { $set: cache },
                    upsert: true,
                },
            })),
            { ordered: false }
        );
    }

    async removeCaches(cacheKeys: string[]): Promise<void> {
        await this.cacheModel.deleteMany({ cacheKey: { $in: cacheKeys } });
    }

    private buildLogMessage(operation: string, keys?: string[]): string {
        return (
            `🟡 MONGO DB: ${operation}` +
            `${keys?.length ? ` (${keys?.length} doc(s)` + `${keys?.length <= 5 ? `: ${keys?.join(', ')}` : ''})` : ''}`
        );
    }
}
