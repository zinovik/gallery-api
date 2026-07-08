import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AlbumModel, FileModel } from '../common/album-file.types';
import { File } from './schemas/file.schema';
import { Album } from './schemas/album.schema';
import { User } from './schemas/user.schema';
import { Cache } from './schemas/cache.schema';

@Injectable()
export class MongoDbService {
    constructor(
        @InjectModel('File') private fileModel: Model<File>,
        @InjectModel('Album') private albumModel: Model<Album>,
        @InjectModel('User') private userModel: Model<User>,
        @InjectModel('Cache') private cacheModel: Model<Cache<unknown>>
    ) {}

    private MONGO_FIELD_REMOVED = {
        _id: 0,
        __v: 0,
    } as const;

    async getFiles(
        path: string,
        _dateRanges?: string[][]
    ): Promise<FileModel[]> {
        const logMessage = this.buildLogMessage('getFiles', path);

        console.time(logMessage);

        const files = await this.fileModel
            .find({}, this.MONGO_FIELD_REMOVED)
            .lean()
            .exec();

        console.timeEnd(logMessage);

        return files;
    }

    async upsertFiles(
        files: {
            filename: string;
            set?: Partial<FileModel>;
            unset?: Record<string, ''>;
        }[]
    ): Promise<void> {
        if (files.length === 0) {
            return;
        }

        await this.fileModel.bulkWrite(
            files.map((file) => ({
                updateOne: {
                    filter: { filename: file.filename },
                    update: {
                        ...(file.set && Object.keys(file.set).length > 0
                            ? { $set: file.set }
                            : {}),
                        ...(file.unset && Object.keys(file.unset).length > 0
                            ? { $unset: file.unset }
                            : {}),
                    },
                    upsert: true,
                },
            })),
            { ordered: false }
        );
    }

    async removeFiles(filenames: string[]): Promise<void> {
        await this.fileModel.deleteMany({ filenames: { $in: filenames } });
    }

    async getAlbums(path: string): Promise<AlbumModel[]> {
        const logMessage = this.buildLogMessage('getAlbums', path);

        console.time(logMessage);

        const albums = await this.albumModel
            .find({}, this.MONGO_FIELD_REMOVED)
            .lean()
            .exec();

        console.timeEnd(logMessage);

        return albums;
    }

    async upsertAlbums(
        albums: {
            path: string;
            set?: Partial<AlbumModel>;
            unset?: Record<string, ''>;
        }[]
    ): Promise<void> {
        if (albums.length === 0) {
            return;
        }

        await this.albumModel.bulkWrite(
            albums.map((album) => ({
                updateOne: {
                    filter: { path: album.path },
                    update: {
                        ...(album.set && Object.keys(album.set).length > 0
                            ? { $set: album.set }
                            : {}),
                        ...(album.unset && Object.keys(album.unset).length > 0
                            ? { $unset: album.unset }
                            : {}),
                    },
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
    private buildLogMessage(
        operation: string,
        parameter?: string | string[]
    ): string {
        const message = `🟡 MONGO DB: ${operation}`;

        if (parameter === undefined) {
            return message;
        }

        if (!Array.isArray(parameter)) {
            return `${message} (${parameter})`;
        }

        const details =
            parameter.length <= 5 ? `: ${parameter.join(', ')}` : '';

        return `${message} (${parameter.length} doc(s)${details})`;
    }
}
