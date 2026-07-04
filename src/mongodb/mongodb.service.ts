import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import {
    AlbumModel,
    FileModel,
    SignedUrlModel,
    SignedUrlModelRead,
} from '../common/album-file.types';
import { User } from '../common/user.type';

const FILES_COLLECTION = 'files' as const;
const FILES_KEY_NAME = 'filename' as const;
const ALBUMS_COLLECTION = 'albums' as const;
const ALBUMS_KEY_NAME = 'path' as const;
const USERS_COLLECTION = 'users' as const;
const USERS_KEY_NAME = 'email' as const;

const SIGNED_URLS_COLLECTION = 'signed-urls' as const;
const SIGNED_URLS_KEY_NAME = 'storagePath' as const;

const CACHE_COLLECTION = 'cache' as const;
const CACHE_KEY_NAME = 'key' as const;

interface CacheEntry<T> {
    key: string;
    data: T;
    expiresAt?: number;
}

@Injectable()
export class MongoDbService {
    constructor(
        @InjectConnection()
        private readonly connection: Connection
    ) {}

    private get db() {
        if (!this.connection.db) {
            throw new InternalServerErrorException(
                'MongoDB is not connected yet'
            );
        }

        return this.connection.db;
    }

    async getFiles(filenames?: string[]): Promise<FileModel[]> {
        return await this.getDocuments<FileModel>(
            FILES_COLLECTION,
            FILES_KEY_NAME,
            filenames
        );
    }

    async setFiles(files: FileModel[]): Promise<void> {
        await this.saveDocuments<FileModel>(
            FILES_COLLECTION,
            files,
            FILES_KEY_NAME
        );
    }

    async removeFiles(filenames?: string[]): Promise<void> {
        await this.removeDocuments<FileModel>(
            FILES_COLLECTION,
            FILES_KEY_NAME,
            filenames
        );
    }

    async getAlbums(paths?: string[]): Promise<AlbumModel[]> {
        return await this.getDocuments<AlbumModel>(
            ALBUMS_COLLECTION,
            ALBUMS_KEY_NAME,
            paths
        );
    }

    async setAlbums(albums: AlbumModel[]): Promise<void> {
        await this.saveDocuments<AlbumModel>(
            ALBUMS_COLLECTION,
            albums,
            ALBUMS_KEY_NAME
        );
    }

    async removeAlbums(paths?: string[]): Promise<void> {
        await this.removeDocuments<AlbumModel>(
            ALBUMS_COLLECTION,
            ALBUMS_KEY_NAME,
            paths
        );
    }

    async getUsers(emails?: string[]): Promise<User[]> {
        return await this.getDocuments<User>(
            USERS_COLLECTION,
            USERS_KEY_NAME,
            emails
        );
    }

    async getSignedUrls(
        storagePaths?: string[]
    ): Promise<SignedUrlModelRead[]> {
        return await this.getDocuments<SignedUrlModelRead>(
            SIGNED_URLS_COLLECTION,
            SIGNED_URLS_KEY_NAME,
            storagePaths
        );
    }

    async setSignedUrls(
        signedUrls: SignedUrlModel[],
        ttlMs?: number
    ): Promise<void> {
        await this.saveDocuments<SignedUrlModel>(
            SIGNED_URLS_COLLECTION,
            signedUrls,
            SIGNED_URLS_KEY_NAME,
            ttlMs
        );
    }

    async getCache<T>(cacheKey: string): Promise<T | null> {
        const [entry] = await this.getDocuments<CacheEntry<T>>(
            CACHE_COLLECTION,
            CACHE_KEY_NAME,
            [cacheKey]
        );

        return entry?.data ?? null;
    }

    async setCache<T>(
        cacheKey: string,
        data: T,
        ttlMs?: number
    ): Promise<void> {
        await this.saveDocuments<{ [CACHE_KEY_NAME]: string; data: T }>(
            CACHE_COLLECTION,
            [{ [CACHE_KEY_NAME]: cacheKey, data }],
            CACHE_KEY_NAME,
            ttlMs
        );
    }

    async removeCache<T>(cacheKeys?: string[]): Promise<void> {
        await this.removeDocuments<{ [CACHE_KEY_NAME]: string; data: T }>(
            CACHE_COLLECTION,
            CACHE_KEY_NAME,
            cacheKeys
        );
    }

    private async getDocuments<T>(
        collectionName: string,
        idKeyName: keyof T,
        filter?: string[]
    ): Promise<T[]> {
        const LOG = `MONGO DB: getDocuments - ${collectionName}${filter?.length ? ` (${filter?.length} items${filter?.length < 3 ? `: ${filter?.join(', ')}` : ''})` : ''}`;

        console.time(LOG);

        const docs = await this.db
            .collection(collectionName)
            .find(filter?.length ? { [idKeyName]: { $in: filter } } : {}, {
                projection: {
                    _id: 0,
                    __v: 0,
                },
            })
            .toArray();

        console.timeEnd(LOG);

        return docs as T[];
    }

    private async saveDocuments<T>(
        collectionName: string,
        documents: T[],
        idKeyName: keyof T,
        ttlMs?: number
    ): Promise<void> {
        if (documents.length === 0) {
            console.warn(
                `MongoDB: No documents to save for collection ${collectionName}`
            );
            return;
        }

        await this.db.collection(collectionName).bulkWrite(
            documents.map((doc) => ({
                updateOne: {
                    filter: { [idKeyName]: doc[idKeyName] },
                    update: {
                        $set: {
                            ...doc,
                            ...(ttlMs && {
                                expiresAt: new Date(Date.now() + ttlMs),
                            }),
                        },
                    },
                    upsert: true,
                },
            })),
            { ordered: false }
        );
    }

    private async removeDocuments<T>(
        collectionName: string,
        idKeyName: keyof T,
        filter?: string[]
    ): Promise<void> {
        await this.db
            .collection(collectionName)
            .deleteMany(filter?.length ? { [idKeyName]: { $in: filter } } : {});
    }
}
