import { Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import {
    AddedAlbum,
    AlbumModel,
    FileModel,
    RemovedAlbum,
    RemovedFile,
    UpdatedAlbum,
    UpdatedFile,
} from '../common/album-file.types';
import { CacheService } from '../cache/cache.service';
import { MongoDbService } from '../mongodb/mongodb.service';
import { isThisOrChildPath } from './helper/common.helper';
import { resolveAccesses } from './helper/access.helper';

const BUCKET_NAME_FILES = 'gallery-files' as const;

const FILES_CACHE_KEY = 'files' as const;
const FILES_LOADED_PATHS_CACHE_KEY = 'files-loaded-paths' as const;
const ALBUMS_CACHE_KEY = 'albums' as const;
const ALBUMS_LOADED_PATHS_CACHE_KEY = 'albums-loaded-paths' as const;
const STORAGE_FILE_PATHS_CACHE_KEY = 'storage-file-paths' as const;

const URL_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days - maximum
const YEAR = 1000 * 60 * 60 * 24 * 365;
const MINUTE = 1000 * 60;

@Injectable()
export class StorageService {
    private readonly storage: Storage = new Storage();

    constructor(
        private readonly mongoDbService: MongoDbService,
        private readonly cacheService: CacheService
    ) {}

    async getAlbums(
        path: string,
        userAccesses: string[],
        isByDateOrTags: boolean
    ): Promise<AlbumModel[]> {
        const userAccessesString = userAccesses.join(',');

        const loadedPaths =
            (await this.cacheService.getCache<Set<string>>(
                `${ALBUMS_LOADED_PATHS_CACHE_KEY}:${userAccessesString}`,
                true
            )) ?? new Set<string>();

        let albums =
            (await this.cacheService.getCache<AlbumModel[]>(
                `${ALBUMS_CACHE_KEY}:${userAccessesString}`,
                true
            )) ?? [];

        const ALL_LOADED_PATH = 'ALL';

        const isAlreadyLoaded = this.getIsAlreadyLoaded(
            [...loadedPaths],
            path === '' && isByDateOrTags ? ALL_LOADED_PATH : path,
            ALL_LOADED_PATH
        );

        if (isAlreadyLoaded) {
            return albums;
        }

        albums = this.uniqueAlbums(
            albums,
            await this.mongoDbService.getAlbums(
                path,
                userAccesses,
                isByDateOrTags
            )
        );
        loadedPaths.add(path === '' && isByDateOrTags ? ALL_LOADED_PATH : path);

        await this.cacheService.setCache<AlbumModel[]>(
            `${ALBUMS_CACHE_KEY}:${userAccessesString}`,
            albums,
            new Date(Date.now() + YEAR),
            true
        );

        await this.cacheService.setCache<Set<string>>(
            `${ALBUMS_LOADED_PATHS_CACHE_KEY}:${userAccessesString}`,
            loadedPaths,
            new Date(Date.now() + YEAR),
            true
        );

        return albums;
    }

    async getFiles(
        path: string,
        userAccesses: string[],
        dateRanges?: string[][],
        tags?: string[]
    ): Promise<FileModel[]> {
        const userAccessesString = userAccesses.join(',');

        // TODO: Add tags and dataRanges
        const loadedPaths =
            (await this.cacheService.getCache<Set<string>>(
                `${FILES_LOADED_PATHS_CACHE_KEY}:${userAccessesString}`,
                true
            )) ?? new Set<string>();

        let files =
            (await this.cacheService.getCache<FileModel[]>(
                `${FILES_CACHE_KEY}:${userAccessesString}`,
                true
            )) ?? [];

        const ALL_LOADED_PATH = 'ALL';

        const isAlreadyLoaded = this.getIsAlreadyLoaded(
            [...loadedPaths],
            path === '' ? ALL_LOADED_PATH : path,
            ALL_LOADED_PATH
        );

        if (isAlreadyLoaded) {
            return files;
        }

        files = this.uniqueFiles(
            files,
            await this.mongoDbService.getFiles(
                path,
                userAccesses,
                dateRanges,
                tags
            )
        );
        loadedPaths.add(path === '' ? ALL_LOADED_PATH : path);

        await this.cacheService.setCache<FileModel[]>(
            `${FILES_CACHE_KEY}:${userAccessesString}`,
            files,
            new Date(Date.now() + YEAR),
            true
        );

        await this.cacheService.setCache<Set<string>>(
            `${FILES_LOADED_PATHS_CACHE_KEY}:${userAccessesString}`,
            loadedPaths,
            new Date(Date.now() + YEAR),
            true
        );

        return files;
    }

    async getSignedUrlsMap(
        filenameAndStoragePathsArgument: [string, string | undefined][]
    ): Promise<Map<string, string>> {
        const filenameAndStoragePaths: [string, string][] =
            filenameAndStoragePathsArgument.filter(
                (entry): entry is [string, string] => entry[1] !== undefined
            );

        const pathMap = Object.fromEntries(filenameAndStoragePaths);

        const signedUrlsMap = new Map<string, string>();
        const filenamesWithoutSignedUrls: string[] = [];
        const cacheSignedUrlsMap = await this.cacheService.getCacheMap<string>(
            filenameAndStoragePaths.map(([, storagePath]) => storagePath)
        );

        filenameAndStoragePaths.forEach(([filename, storagePath]) => {
            const signedUrl = cacheSignedUrlsMap.get(storagePath);
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

    async getStorageFilePaths(
        storageFilesHaveBeenChanged?: true
    ): Promise<string[]> {
        let storageFilePaths = (
            await this.cacheService.getCacheMap<string[]>([
                STORAGE_FILE_PATHS_CACHE_KEY,
            ])
        ).get(STORAGE_FILE_PATHS_CACHE_KEY);

        if (!storageFilePaths || storageFilesHaveBeenChanged) {
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

            if (file.tags !== undefined) {
                if (file.tags.length === 0) {
                    unset.tags = '';
                } else {
                    set.tags = file.tags;
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

    async addAlbums(albums?: AddedAlbum[]) {
        if (!albums || albums.length === 0) return;

        await this.mongoDbService.upsertAlbums(
            albums.map((album) => ({
                path: album.path,
                set: album,
            }))
        );
    }

    private uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
        const seen = new Set<string>();

        return items.filter((item) => {
            const value = key(item);

            if (seen.has(value)) {
                return false;
            }

            seen.add(value);
            return true;
        });
    }

    private uniqueFiles(...fileGroups: FileModel[][]): FileModel[] {
        return this.uniqueBy(fileGroups.flat(), (file) => file.filename);
    }

    private uniqueAlbums(...albumGroups: AlbumModel[][]): AlbumModel[] {
        return this.uniqueBy(albumGroups.flat(), (album) => album.path);
    }

    private getIsAlreadyLoaded(
        loadedPaths: string[],
        currentPath: string,
        allLoadedPath: string
    ): boolean {
        return (
            loadedPaths.includes(allLoadedPath) ||
            loadedPaths.some((loadedPath) =>
                isThisOrChildPath(currentPath, loadedPath)
            )
        );
    }

    async resolve(storageFilesHaveBeenChanged?: true): Promise<void> {
        const [storageFilePaths, dbFiles, dbAlbums] = await Promise.all([
            this.getStorageFilePaths(storageFilesHaveBeenChanged),
            this.mongoDbService.getAllFiles(),
            this.mongoDbService.getAllAlbums(),
        ]);

        // POPULATE (RESOLVE FILE PATH AND STORAGE PATH, AND ALBUM TITLE)

        const populatedFiles = this.populateFiles(storageFilePaths, dbFiles);

        const filePaths: string[] = [
            ...new Set(
                populatedFiles.flatMap((file) =>
                    this.getCurrentAndParentPaths(
                        file.resolved.path ?? file.path ?? 'NOT RESOLVED'
                    )
                )
            ),
        ];

        const populatedAlbums = this.populateAlbums(filePaths, dbAlbums);

        // RESOLVE ACCESS

        const albumsMap = new Map(
            populatedAlbums.map((album) => [album.path, album])
        );
        const albumsWithResolvedAccesses = populatedAlbums.map((album) => ({
            ...album,
            resolved: {
                ...album.resolved,
                accesses: resolveAccesses(
                    album.accesses,
                    album.path,
                    albumsMap
                ),
            },
        }));

        const filesWithResolvedAccesses = populatedFiles.map((file) => ({
            ...file,
            resolved: {
                ...file.resolved,
                accesses: resolveAccesses(
                    file.accesses,
                    file.resolved.path ?? file.path ?? 'NOT RESOLVED',
                    albumsMap
                ),
            },
        }));

        const albumsWithDefaultAccesses = new Map<string, AlbumModel>();

        albumsWithResolvedAccesses.forEach((album) => {
            if (album.defaultAccesses) {
                albumsWithDefaultAccesses.set(album.path, album);
            }
        });

        await this.mongoDbService.upsertAlbums(
            this.cleanAlbums(
                albumsWithResolvedAccesses,
                albumsWithDefaultAccesses
            )
        );

        await this.mongoDbService.upsertFiles(
            this.cleanFiles(
                filesWithResolvedAccesses,
                albumsWithDefaultAccesses
            )
        );
    }

    private populateFiles(
        storageFilePaths: string[],
        files: FileModel[]
    ): (FileModel & { resolved: { path?: string; storagePath?: string } })[] {
        const DATE_PREFIX_REGEX = /(?:^|\/)\d{4}\.\d{2}\.\d{2} - /;
        const CLEAN_CHARS_REGEX = /[().,]/g;
        const WHITESPACE_REGEX = /[\s']+/g;
        const DASHES_REGEX = /-+/g;

        const filesMap = new Map<string, FileModel>();
        for (const file of files) {
            filesMap.set(file.filename, file);
        }

        const result: (FileModel & {
            resolved: { path?: string; storagePath?: string };
        })[] = [];

        for (const storageFilePath of storageFilePaths) {
            const lastSlash = storageFilePath.lastIndexOf('/');
            const filename =
                lastSlash >= 0
                    ? storageFilePath.slice(lastSlash + 1)
                    : storageFilePath;

            const file = filesMap.get(filename);

            let path: string;

            if (file?.path) {
                path = file.path;
            } else {
                const dir =
                    lastSlash >= 0 ? storageFilePath.slice(0, lastSlash) : '';

                path = dir
                    .replace(DATE_PREFIX_REGEX, '')
                    .trim()
                    .replace(CLEAN_CHARS_REGEX, '')
                    .replace(WHITESPACE_REGEX, '-')
                    .replace(DASHES_REGEX, '-')
                    .toLowerCase();
            }

            result.push({
                ...file,
                filename,
                resolved: {
                    ...file?.resolved,
                    path,
                    storagePath: storageFilePath,
                },
            });
        }

        return result;
    }

    private populateAlbums(
        filePaths: string[],
        albums: AlbumModel[]
    ): (AlbumModel & { resolved: { title?: string } })[] {
        const albumsMap = new Map<string, AlbumModel>();
        albums.forEach((album) => albumsMap.set(album.path, album));

        const populatedAlbums: (AlbumModel & {
            resolved: { title: string };
        })[] = [];
        const usedAlbums: Set<string> = new Set();

        filePaths.forEach((filePath) => {
            const album = albumsMap.get(filePath);

            if (album) usedAlbums.add(album.path);

            populatedAlbums.push({
                ...album,
                path: filePath,
                resolved: {
                    ...album?.resolved,
                    title:
                        album?.title ??
                        filePath
                            .split('/')
                            .slice(-1)[0]
                            .replace(/-/g, ' ')
                            .replace(/\b\w/g, (c) => c.toUpperCase()),
                },
            });
        });

        albums.forEach((album) => {
            if (!usedAlbums.has(album.path)) {
                populatedAlbums.push({
                    ...album,
                    resolved: {
                        ...album.resolved,
                        title:
                            album.title ??
                            (album.path.split('/').pop() ?? '')
                                .replace(/-/g, ' ')
                                .replace(/\b\w/g, (c) => c.toUpperCase()),
                    },
                });
            }
        });

        return populatedAlbums;
    }

    private getCurrentAndParentPaths(path: string): string[] {
        const parts = path.split('/');
        const result = [];

        for (let i = parts.length; i > 0; i--) {
            result.push(parts.slice(0, i).join('/'));
        }

        return result;
    }

    private cleanFiles(
        files: FileModel[],
        _albumsWithDefaultAccesses: Map<string, AlbumModel>
    ): {
        filename: string;
        set?: Partial<FileModel>;
        unset?: Record<string, ''>;
    }[] {
        return files.map((file) => {
            const unset: Record<string, ''> = {};

            // TODO: accesses
            // TODO: path

            if (!file.text) {
                unset.text = '';
            }

            if (!file.description) {
                unset.description = '';
            }

            return {
                filename: file.filename,
                set: file,
                unset,
            };
        });
    }

    private cleanAlbums(
        albums: AlbumModel[],
        albumsWithDefaultAccesses: Map<string, AlbumModel>
    ): {
        path: string;
        set?: Partial<AlbumModel>;
        unset?: Record<string, ''>;
    }[] {
        return albums.map((album) => {
            const unset: Record<string, ''> = {};

            let albumWithDefaultAccesses;
            let path = album.path;

            while (path) {
                albumWithDefaultAccesses = albumsWithDefaultAccesses.get(path);

                if (albumWithDefaultAccesses) break;

                path = path.substring(0, path.lastIndexOf('/'));
            }

            if (
                albumWithDefaultAccesses &&
                album.accesses &&
                album.accesses.join(',') ===
                    albumWithDefaultAccesses.defaultAccesses?.join(',')
            ) {
                unset.accesses = '';
            }

            if (
                album.title ===
                album.path
                    .split('/')
                    .slice(-1)[0]
                    .replace(/-/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase())
            ) {
                unset.title = '';
            }

            if (!album.text) {
                unset.text = '';
            }

            return {
                path: album.path,
                set: album,
                unset,
            };
        });
    }
}
