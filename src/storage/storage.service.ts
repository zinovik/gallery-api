import { Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import {
    AddedAlbum,
    AddedFile,
    AlbumModel,
    FileModel,
    UpdatedAlbum,
    UpdatedFile,
} from '../common/album-file.types';
import { CacheService } from '../cache/cache.service';
import { FirestoreService } from '../firestore/firestore.service';
import { Timestamp } from '@google-cloud/firestore';

const BUCKET_NAME_FILES = 'gallery-files' as const;

const FIRESTORE_FILES_COLLECTION = 'files' as const;
const FIRESTORE_FILES_KEY_NAME = 'filename' as const;
const FIRESTORE_ALBUMS_COLLECTION = 'albums' as const;
const FIRESTORE_ALBUMS_KEY_NAME = 'path' as const;

const FIRESTORE_SIGNED_URLS_COLLECTION = 'signed-urls' as const;
const FIRESTORE_SIGNED_URLS_KEY_NAME = 'storagePath' as const;

const URL_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days - maximum

interface SignedUrlModel {
    [FIRESTORE_SIGNED_URLS_KEY_NAME]: string;
    url: string;
}

interface SignedUrlModelRead extends SignedUrlModel {
    expiresAt: Timestamp;
}

interface InMemorySignedUrlModel {
    url: string;
    expiresAt: number;
}

@Injectable()
export class StorageService {
    private readonly storage: Storage = new Storage();

    constructor(
        private readonly firestoreService: FirestoreService,
        private readonly cacheService: CacheService
    ) {}

    async getAlbums(): Promise<AlbumModel[]> {
        let data = await this.cacheService.get<AlbumModel[]>(
            FIRESTORE_ALBUMS_COLLECTION,
            true
        );

        if (!data) {
            data = (await this.firestoreService.getAllFirestoreDocuments(
                FIRESTORE_ALBUMS_COLLECTION,
                FIRESTORE_ALBUMS_KEY_NAME
            )) as AlbumModel[]; // because we trust our "db";

            await this.cacheService.set(
                FIRESTORE_ALBUMS_COLLECTION,
                data,
                true
            );
        }

        return data;
    }

    async getFiles(): Promise<FileModel[]> {
        let data = await this.cacheService.get<FileModel[]>(
            FIRESTORE_FILES_COLLECTION,
            true
        );

        if (!data) {
            data = (await this.firestoreService.getAllFirestoreDocuments(
                FIRESTORE_FILES_COLLECTION,
                FIRESTORE_FILES_KEY_NAME
            )) as FileModel[]; // because we trust our "db";

            await this.cacheService.set(FIRESTORE_FILES_COLLECTION, data, true);
        }

        return data;
    }

    async getSignedUrlsMap(filenames: string[]): Promise<Map<string, string>> {
        const now = Date.now();

        const filePaths = await this.getStorageFilePaths();

        const pathMap = Object.fromEntries(
            filePaths.map((path) => [path.split('/').pop(), path])
        );

        const signedUrlsMap = new Map<string, string>();
        const filenamesWithoutInMemoryCacheUrls: string[] = [];
        const CACHE_KEY = 'signed-urls-map';
        const inMemoryCacheSignedUrlsMap =
            (await this.cacheService.get<Map<string, InMemorySignedUrlModel>>(
                CACHE_KEY,
                true
            )) ?? new Map<string, InMemorySignedUrlModel>();

        filenames.forEach((filename) => {
            const signedUrl = inMemoryCacheSignedUrlsMap.get(pathMap[filename]);
            if (signedUrl && signedUrl.expiresAt > now)
                signedUrlsMap.set(filename, signedUrl.url);
            else filenamesWithoutInMemoryCacheUrls.push(filename);
        });

        if (filenamesWithoutInMemoryCacheUrls.length === 0) {
            return signedUrlsMap;
        }

        const dbSignedUrls =
            await this.firestoreService.getFirestoreDocuments<SignedUrlModelRead>(
                FIRESTORE_SIGNED_URLS_COLLECTION,
                filenamesWithoutInMemoryCacheUrls.map(
                    (filename) => pathMap[filename]
                ),
                FIRESTORE_SIGNED_URLS_KEY_NAME
            );

        const dbSignedUrlsMap = new Map<string, SignedUrlModelRead>();
        dbSignedUrls.forEach((dbSignedUrl) => {
            dbSignedUrlsMap.set(
                dbSignedUrl[FIRESTORE_SIGNED_URLS_KEY_NAME],
                dbSignedUrl
            );
        });

        const filenamesWithoutSignedUrls: string[] = [];

        filenamesWithoutInMemoryCacheUrls.forEach((filename) => {
            const dbSignedUrl = dbSignedUrlsMap.get(pathMap[filename]);
            if (dbSignedUrl && dbSignedUrl.expiresAt.toMillis() > now) {
                signedUrlsMap.set(filename, dbSignedUrl.url);
                inMemoryCacheSignedUrlsMap.set(pathMap[filename], {
                    url: dbSignedUrl.url,
                    expiresAt: dbSignedUrl.expiresAt.toMillis(),
                });
            } else filenamesWithoutSignedUrls.push(filename);
        });

        if (filenamesWithoutSignedUrls.length === 0) {
            await this.cacheService.set(
                CACHE_KEY,
                inMemoryCacheSignedUrlsMap,
                true
            );

            return signedUrlsMap;
        }

        const newSignedUrls: SignedUrlModel[] = [];

        console.time(
            `GOOGLE CLOUD STORAGE: getSignedUrlsMap.getSignedUrl (${filenamesWithoutSignedUrls.length})`
        );
        const batchSize = 5;
        for (let i = 0; i < filenamesWithoutSignedUrls.length; i += batchSize) {
            const batch = filenamesWithoutSignedUrls.slice(i, i + batchSize);

            await Promise.all(
                batch.map(async (filename) => {
                    const filePath = pathMap[filename];

                    if (!filePath) return;

                    const url = await this.getSignedUrl(filePath);

                    signedUrlsMap.set(filename, url);
                    if (url) {
                        inMemoryCacheSignedUrlsMap.set(pathMap[filename], {
                            url,
                            expiresAt: now + URL_TTL,
                        });
                        newSignedUrls.push({
                            [FIRESTORE_SIGNED_URLS_KEY_NAME]: pathMap[filename],
                            url,
                        });
                    }
                })
            );
        }
        console.timeEnd(
            `GOOGLE CLOUD STORAGE: getSignedUrlsMap.getSignedUrl (${filenamesWithoutSignedUrls.length})`
        );

        await this.cacheService.set<Map<string, InMemorySignedUrlModel>>(
            CACHE_KEY,
            inMemoryCacheSignedUrlsMap,
            true
        );

        await this.firestoreService.writeFirestoreDocuments<SignedUrlModel>(
            FIRESTORE_SIGNED_URLS_COLLECTION,
            newSignedUrls,
            FIRESTORE_SIGNED_URLS_KEY_NAME,
            URL_TTL
        );

        return signedUrlsMap;
    }

    async getStorageFilePaths(): Promise<string[]> {
        console.time('getStorageFilePaths');

        const CACHE_KEY = 'storage-file-paths';
        let data = await this.cacheService.get<string[]>(CACHE_KEY);

        if (!data) {
            console.time('GOOGLE CLOUD STORAGE: getStorageFilePaths.getFiles');
            const bucket = this.storage.bucket(BUCKET_NAME_FILES);
            const [files] = await bucket.getFiles();
            data = files.map((file) => file.name);
            console.timeEnd(
                'GOOGLE CLOUD STORAGE: getStorageFilePaths.getFiles'
            );

            await this.cacheService.set<string[]>(CACHE_KEY, data);
        }
        console.timeEnd('getStorageFilePaths');

        return data;
    }

    private async getSignedUrl(filePath: string): Promise<string> {
        const bucket = this.storage.bucket(BUCKET_NAME_FILES);

        try {
            const [url] = await bucket.file(filePath).getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + URL_TTL,
            });

            return url;
        } catch (error) {
            console.error(`Failed to sign ${filePath}`, error);
            return '';
        }
    }

    async removeFiles(filenames?: string[]) {
        if (!filenames || filenames.length === 0) return;

        await this.firestoreService.removeFirestoreDocuments(
            FIRESTORE_FILES_COLLECTION,
            [...new Set(filenames)]
        );
    }

    async removeAlbums(paths?: string[]) {
        if (!paths || paths.length === 0) return;

        await this.firestoreService.removeFirestoreDocuments(
            FIRESTORE_ALBUMS_COLLECTION,
            [...new Set(paths)]
        );
    }

    async updateFiles(updatedFiles?: UpdatedFile[]) {
        if (!updatedFiles || updatedFiles.length === 0) return;

        const filenames = updatedFiles.map((f) => f.filename);

        const dbFiles =
            await this.firestoreService.getFirestoreDocuments<FileModel>(
                FIRESTORE_FILES_COLLECTION,
                filenames,
                FIRESTORE_FILES_KEY_NAME
            );

        const updatedFilesMap: Record<
            string,
            Omit<UpdatedFile, 'filename'>
        > = {};
        updatedFiles.forEach((updatedFile) => {
            const { filename, ...rest } = updatedFile;

            updatedFilesMap[filename] = {
                ...(updatedFilesMap[filename] ?? {}),
                ...rest,
            };
        });

        const appliedUpdatesFiles: FileModel[] = dbFiles.map((dbFile) => {
            const updatedFile = updatedFilesMap[dbFile.filename];

            const appliedUpdatesFile = {
                ...dbFile,
                ...(updatedFile.path !== undefined
                    ? { path: updatedFile.path }
                    : {}),
                ...(updatedFile.description !== undefined
                    ? { description: updatedFile.description }
                    : {}),
                ...(updatedFile.text !== undefined
                    ? { text: updatedFile.text }
                    : {}),
                ...(updatedFile.accesses !== undefined
                    ? {
                          accesses: updatedFile.accesses,
                      }
                    : {}),
            };

            if (appliedUpdatesFile.path === '') delete appliedUpdatesFile.path;
            if (appliedUpdatesFile.description === '')
                delete appliedUpdatesFile.description;
            if (appliedUpdatesFile.text === '') delete appliedUpdatesFile.text;
            if (appliedUpdatesFile.accesses?.length === 0)
                delete appliedUpdatesFile.accesses;

            return appliedUpdatesFile;
        });

        await this.firestoreService.writeFirestoreDocuments(
            FIRESTORE_FILES_COLLECTION,
            appliedUpdatesFiles,
            FIRESTORE_FILES_KEY_NAME
        );
    }

    async updateAlbums(updatedAlbums?: UpdatedAlbum[]) {
        if (!updatedAlbums || updatedAlbums.length === 0) return;

        const paths = updatedAlbums.map((a) => a.path);

        const dbAlbums =
            await this.firestoreService.getFirestoreDocuments<AlbumModel>(
                FIRESTORE_ALBUMS_COLLECTION,
                paths,
                FIRESTORE_ALBUMS_KEY_NAME
            );

        const updatedAlbumsMap = new Map<string, Omit<UpdatedAlbum, 'path'>>();
        updatedAlbums.forEach((updatedAlbum) => {
            const { path, ...rest } = updatedAlbum;

            updatedAlbumsMap.set(path, {
                ...(updatedAlbumsMap.get(path) ?? {}),
                ...rest,
            });
        });

        const appliedUpdatesAlbums: AlbumModel[] = dbAlbums.map((dbAlbum) => {
            const updatedAlbum = updatedAlbumsMap.get(dbAlbum.path);

            if (!updatedAlbum) return dbAlbum;

            const appliedUpdatesAlbum = {
                ...dbAlbum,
                ...(updatedAlbum.newPath !== undefined
                    ? { path: updatedAlbum.newPath }
                    : {}),
                ...(updatedAlbum.title !== undefined
                    ? { title: updatedAlbum.title }
                    : {}),
                ...(updatedAlbum.text !== undefined
                    ? { text: updatedAlbum.text }
                    : {}),
                ...(updatedAlbum.defaultByDate !== undefined
                    ? { defaultByDate: true }
                    : {}),
                ...(updatedAlbum.order !== undefined
                    ? { order: updatedAlbum.order }
                    : {}),
                ...(updatedAlbum.accesses !== undefined
                    ? {
                          accesses: updatedAlbum.accesses,
                      }
                    : {}),
                ...(updatedAlbum.defaultAccesses !== undefined
                    ? {
                          defaultAccesses: updatedAlbum.defaultAccesses,
                      }
                    : {}),
            };

            if (appliedUpdatesAlbum.title === '')
                delete appliedUpdatesAlbum.title;
            if (appliedUpdatesAlbum.text === '')
                delete appliedUpdatesAlbum.text;
            if (appliedUpdatesAlbum.defaultByDate === false)
                delete appliedUpdatesAlbum.defaultByDate;
            if (appliedUpdatesAlbum.order === 0)
                delete appliedUpdatesAlbum.order;
            if (appliedUpdatesAlbum.accesses?.length === 0)
                delete appliedUpdatesAlbum.accesses;
            if (appliedUpdatesAlbum.defaultAccesses?.length === 0)
                delete appliedUpdatesAlbum.defaultAccesses;

            return appliedUpdatesAlbum;
        });

        await this.firestoreService.writeFirestoreDocuments<AlbumModel>(
            FIRESTORE_ALBUMS_COLLECTION,
            appliedUpdatesAlbums,
            FIRESTORE_ALBUMS_KEY_NAME
        );
    }

    async addFiles(files?: AddedFile[]) {
        if (!files || files.length === 0) return;

        await this.firestoreService.writeFirestoreDocuments<FileModel>(
            FIRESTORE_FILES_COLLECTION,
            files,
            FIRESTORE_FILES_KEY_NAME
        );
    }

    async addAlbums(albums?: AddedAlbum[]) {
        if (!albums || albums.length === 0) return;

        await this.firestoreService.writeFirestoreDocuments<AlbumModel>(
            FIRESTORE_ALBUMS_COLLECTION,
            albums,
            FIRESTORE_ALBUMS_KEY_NAME
        );
    }
}
