import { Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import {
    AddedAlbum,
    AddedFile,
    AlbumModel,
    FileModel,
    RemovedAlbum,
    RemovedFile,
    UpdatedAlbum,
    UpdatedFile,
} from '../common/album-file.types';
import { CacheService } from '../cache/cache.service';
import { MongoDbService } from '../mongodb/mongodb.service';

const BUCKET_NAME_FILES = 'gallery-files' as const;

const FILES_CACHE_KEY = 'files' as const;
const ALBUMS_CACHE_KEY = 'albums' as const;
const STORAGE_FILE_PATHS_CACHE_KEY = 'storage-file-paths' as const;

const URL_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days - maximum
const YEAR = 365 * 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

@Injectable()
export class StorageService {
    private readonly storage: Storage = new Storage();

    constructor(
        private readonly mongoDbService: MongoDbService,
        private readonly cacheService: CacheService
    ) {}

    async getAlbums(path: string): Promise<AlbumModel[]> {
        const cacheKey = ALBUMS_CACHE_KEY;

        let albums = await this.cacheService.getCache<AlbumModel[]>(
            cacheKey,
            true
        );

        if (!albums) {
            albums = await this.mongoDbService.getAlbums(path);

            await this.cacheService.setCache<AlbumModel[]>(
                cacheKey,
                albums,
                new Date(Date.now() + YEAR),
                true
            );
        }

        return albums;
    }

    async getFiles(
        path: string,
        dateRanges?: string[][]
    ): Promise<FileModel[]> {
        const cacheKey = FILES_CACHE_KEY;

        let files = await this.cacheService.getCache<FileModel[]>(
            cacheKey,
            true
        );

        if (!files) {
            files = await this.mongoDbService.getFiles(path, dateRanges);

            await this.cacheService.setCache<FileModel[]>(
                cacheKey,
                files,
                new Date(Date.now() + YEAR),
                true
            );
        }

        return files;
    }

    async getSignedUrlsMap(filenames: string[]): Promise<Map<string, string>> {
        const filePaths = await this.getStorageFilePaths();

        const pathMap = Object.fromEntries(
            filePaths.map((path) => [path.split('/').pop(), path])
        );

        const signedUrlsMap = new Map<string, string>();
        const filenamesWithoutSignedUrls: string[] = [];
        const cacheSignedUrlsMap = await this.cacheService.getCacheMap<string>(
            filenames.map((filename) => pathMap[filename])
        );

        filenames.forEach((filename) => {
            const signedUrl = cacheSignedUrlsMap.get(pathMap[filename]);
            if (signedUrl) {
                signedUrlsMap.set(filename, signedUrl);
            } else filenamesWithoutSignedUrls.push(filename);
        });

        if (filenamesWithoutSignedUrls.length === 0) {
            return signedUrlsMap;
        }

        const newCaches: {
            cacheKey: string;
            data: string;
            expiresAt: Date;
        }[] = [];

        console.time(
            `🔴 GOOGLE CLOUD STORAGE: getSignedUrlsMap.getSignedUrl (${filenamesWithoutSignedUrls.length})`
        );
        const now = Date.now();
        const batchSize = 10;
        for (let i = 0; i < filenamesWithoutSignedUrls.length; i += batchSize) {
            const batch = filenamesWithoutSignedUrls.slice(i, i + batchSize);

            await Promise.all(
                batch.map(async (filename) => {
                    const filePath = pathMap[filename];

                    if (!filePath) return;

                    const url = await this.getSignedUrl(filePath);

                    signedUrlsMap.set(filename, url);
                    if (url) {
                        newCaches.push({
                            cacheKey: filePath,
                            data: url,
                            expiresAt: new Date(now + URL_TTL - MINUTE), // 1 minute less because mongo removes it once per minute
                        });
                    }
                })
            );
        }
        console.timeEnd(
            `🔴 GOOGLE CLOUD STORAGE: getSignedUrlsMap.getSignedUrl (${filenamesWithoutSignedUrls.length})`
        );

        await this.cacheService.setCaches<string>(newCaches);

        return signedUrlsMap;
    }

    async getStorageFilePaths(): Promise<string[]> {
        let storageFilePaths = (
            await this.cacheService.getCacheMap<string[]>([
                STORAGE_FILE_PATHS_CACHE_KEY,
            ])
        ).get(STORAGE_FILE_PATHS_CACHE_KEY);

        if (!storageFilePaths) {
            console.time(
                '🔴 GOOGLE CLOUD STORAGE: getStorageFilePaths.getFiles'
            );
            const bucket = this.storage.bucket(BUCKET_NAME_FILES);
            const [files] = await bucket.getFiles();
            storageFilePaths = files.map((file) => file.name);
            console.timeEnd(
                '🔴 GOOGLE CLOUD STORAGE: getStorageFilePaths.getFiles'
            );

            await this.cacheService.setCaches<string[]>([
                {
                    cacheKey: STORAGE_FILE_PATHS_CACHE_KEY,
                    data: storageFilePaths,
                    expiresAt: new Date(Date.now() + YEAR),
                },
            ]);
        }

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

    async removeFiles(removedFile?: RemovedFile[]) {
        if (!removedFile || removedFile.length === 0) return;

        await this.mongoDbService.removeFiles(
            removedFile.map((file) => file.filename)
        );
    }

    async removeAlbums(removedAlbums?: RemovedAlbum[]) {
        if (!removedAlbums || removedAlbums.length === 0) return;

        await this.mongoDbService.removeAlbums(
            removedAlbums.map((album) => album.path)
        );
    }

    async updateFiles(updatedFiles?: UpdatedFile[]) {
        if (!updatedFiles || updatedFiles.length === 0) return;

        const updates = updatedFiles.map((file) => {
            const set: Partial<FileModel> = {};
            const unset: Record<string, ''> = {};

            if (file.path !== undefined) {
                if (file.path === '') {
                    unset.path = '';
                } else {
                    set.path = file.path;
                }
            }

            if (file.description !== undefined) {
                if (file.description === '') {
                    unset.description = '';
                } else {
                    set.description = file.description;
                }
            }

            if (file.text !== undefined) {
                if (file.text === '') {
                    unset.text = '';
                } else {
                    set.text = file.text;
                }
            }

            if (file.accesses !== undefined) {
                if (file.accesses.length === 0) {
                    unset.accesses = '';
                } else {
                    set.accesses = file.accesses;
                }
            }

            return {
                filename: file.filename,
                set,
                unset,
            };
        });

        await this.mongoDbService.upsertFiles(updates);
    }

    async updateAlbums(updatedAlbums?: UpdatedAlbum[]) {
        if (!updatedAlbums || updatedAlbums.length === 0) return;

        const updates = updatedAlbums.map((album) => {
            const set: Partial<AlbumModel> = {};
            const unset: Record<string, ''> = {};

            if (album.newPath !== undefined) {
                set.path = album.newPath;
            }

            if (album.title !== undefined) {
                if (album.title === '') {
                    unset.title = '';
                } else {
                    set.title = album.title;
                }
            }

            if (album.text !== undefined) {
                if (album.text === '') {
                    unset.text = '';
                } else {
                    set.text = album.text;
                }
            }

            if (album.defaultByDate !== undefined) {
                if (album.defaultByDate === false) {
                    unset.defaultByDate = '';
                } else {
                    set.defaultByDate = true;
                }
            }

            if (album.order !== undefined) {
                if (album.order === 0) {
                    unset.order = '';
                } else {
                    set.order = album.order;
                }
            }

            if (album.accesses !== undefined) {
                if (album.accesses.length === 0) {
                    unset.accesses = '';
                } else {
                    set.accesses = album.accesses;
                }
            }

            if (album.defaultAccesses !== undefined) {
                if (album.defaultAccesses.length === 0) {
                    unset.defaultAccesses = '';
                } else {
                    set.defaultAccesses = album.defaultAccesses;
                }
            }

            return {
                path: album.path,
                set,
                unset,
            };
        });

        await this.mongoDbService.upsertAlbums(updates);
    }

    async addFiles(files?: AddedFile[]) {
        if (!files || files.length === 0) return;

        await this.mongoDbService.upsertFiles(
            files.map((file) => ({
                filename: file.filename,
                set: file,
            }))
        );
    }

    async addAlbums(albums?: AddedAlbum[]) {
        if (!albums || albums.length === 0) return;

        await this.mongoDbService.upsertAlbums(
            albums.map((album) => ({
                path: album.path,
                set: album,
            }))
        );
    }
}
