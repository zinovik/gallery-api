import { Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import {
    AddedAlbum,
    AddedFile,
    AlbumModel,
    FileModel,
    SignedUrlModel,
    SignedUrlModelRead,
    UpdatedAlbum,
    UpdatedFile,
} from '../common/album-file.types';
import { CacheService } from '../cache/cache.service';
import { MongoDbService } from '../mongodb/mongodb.service';

const BUCKET_NAME_FILES = 'gallery-files' as const;

const FILES_CACHE_KEY = 'files' as const;
const ALBUMS_CACHE_KEY = 'albums' as const;
const STORAGE_FILE_PATHS_CACHE_KEY = 'storage-file-paths';

const URL_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days - maximum

interface InMemorySignedUrlModel {
    url: string;
    expiresAt: number;
}

@Injectable()
export class StorageService {
    private readonly storage: Storage = new Storage();

    constructor(
        private readonly mongoDbService: MongoDbService,
        private readonly cacheService: CacheService
    ) {}

    async getAlbums(): Promise<AlbumModel[]> {
        let data = await this.cacheService.get<AlbumModel[]>(
            ALBUMS_CACHE_KEY,
            true
        );

        if (!data) {
            data = await this.mongoDbService.getAlbums();

            await this.cacheService.set(ALBUMS_CACHE_KEY, data, true);
        }

        return data;
    }

    async getFiles(): Promise<FileModel[]> {
        let data = await this.cacheService.get<FileModel[]>(
            FILES_CACHE_KEY,
            true
        );

        if (!data) {
            data = await this.mongoDbService.getFiles();

            await this.cacheService.set(FILES_CACHE_KEY, data, true);
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

        const dbSignedUrls = await this.mongoDbService.getSignedUrls(
            filenamesWithoutInMemoryCacheUrls.map(
                (filename) => pathMap[filename]
            )
        );

        const dbSignedUrlsMap = new Map<string, SignedUrlModelRead>();
        dbSignedUrls.forEach((dbSignedUrl) => {
            dbSignedUrlsMap.set(dbSignedUrl.storagePath, dbSignedUrl);
        });

        const filenamesWithoutSignedUrls: string[] = [];

        filenamesWithoutInMemoryCacheUrls.forEach((filename) => {
            const dbSignedUrl = dbSignedUrlsMap.get(pathMap[filename]);
            if (dbSignedUrl && dbSignedUrl.expiresAt > now) {
                signedUrlsMap.set(filename, dbSignedUrl.url);
                inMemoryCacheSignedUrlsMap.set(pathMap[filename], {
                    url: dbSignedUrl.url,
                    expiresAt: dbSignedUrl.expiresAt,
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
                            storagePath: pathMap[filename],
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

        await this.mongoDbService.setSignedUrls(newSignedUrls, URL_TTL);

        return signedUrlsMap;
    }

    async getStorageFilePaths(): Promise<string[]> {
        console.time('getStorageFilePaths');

        let storageFilePaths = await this.cacheService.get<string[]>(
            STORAGE_FILE_PATHS_CACHE_KEY
        );

        if (!storageFilePaths) {
            console.time('GOOGLE CLOUD STORAGE: getStorageFilePaths.getFiles');
            const bucket = this.storage.bucket(BUCKET_NAME_FILES);
            const [files] = await bucket.getFiles();
            storageFilePaths = files.map((file) => file.name);
            console.timeEnd(
                'GOOGLE CLOUD STORAGE: getStorageFilePaths.getFiles'
            );

            await this.cacheService.set<string[]>(
                STORAGE_FILE_PATHS_CACHE_KEY,
                storageFilePaths
            );
        }
        console.timeEnd('getStorageFilePaths');

        return storageFilePaths;
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

        await this.mongoDbService.removeFiles(filenames);
    }

    async removeAlbums(paths?: string[]) {
        if (!paths || paths.length === 0) return;

        await this.mongoDbService.removeAlbums(paths);
    }

    async updateFiles(updatedFiles?: UpdatedFile[]) {
        if (!updatedFiles || updatedFiles.length === 0) return;

        const filenames = updatedFiles.map((f) => f.filename);

        const dbFiles = await this.mongoDbService.getFiles(filenames);

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

        await this.mongoDbService.setFiles(appliedUpdatesFiles);
    }

    async updateAlbums(updatedAlbums?: UpdatedAlbum[]) {
        if (!updatedAlbums || updatedAlbums.length === 0) return;

        const paths = updatedAlbums.map((a) => a.path);

        const dbAlbums = await this.mongoDbService.getAlbums(paths);

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

        await this.mongoDbService.setAlbums(appliedUpdatesAlbums);
    }

    async addFiles(files?: AddedFile[]) {
        if (!files || files.length === 0) return;

        await this.mongoDbService.setFiles(files);
    }

    async addAlbums(albums?: AddedAlbum[]) {
        if (!albums || albums.length === 0) return;

        await this.mongoDbService.setAlbums(albums);
    }
}
