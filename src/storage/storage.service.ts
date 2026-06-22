import { Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import {
    AddedAlbum,
    AlbumModel,
    FileModel,
    UpdatedAlbum,
    UpdatedFile,
} from '../common/album-file.types';
import { CacheService } from '../cache/cache.service';
import { FirestoreService } from '../firestore/firestore.service';

const BUCKET_NAME_FILES = 'gallery-files';

const FIRESTORE_FILES_COLLECTION = 'files';
const FIRESTORE_FILES_KEY_NAME = 'filename';
const FIRESTORE_ALBUMS_COLLECTION = 'albums';
const FIRESTORE_ALBUMS_KEY_NAME = 'path';

const FIRESTORE_SIGNED_URLS_COLLECTION = 'signed-urls';
const FIRESTORE_SIGNED_URLS_KEY_NAME = 'storagePath';

const URL_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days - maximum

type SignedUrlModel = {
    [FIRESTORE_SIGNED_URLS_KEY_NAME]: string;
    url: string;
};

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

    async getSignedUrlsMap(
        filenames: string[]
    ): Promise<Record<string, string>> {
        const filePaths = await this.getStorageFilePaths();

        const pathMap = Object.fromEntries(
            filePaths.map((path) => [path.split('/').pop(), path])
        );

        const signedUrlsMap: Record<string, string> = {};
        const filenamesWithoutInMemoryCacheUrls: string[] = [];
        const CACHE_KEY = 'signed-urls-map';
        const inMemoryCacheSignedUrlsMap = {
            ...(await this.cacheService.get<Record<string, string>>(
                CACHE_KEY,
                true
            )),
        };

        filenames.forEach((filename) => {
            const url = inMemoryCacheSignedUrlsMap[pathMap[filename]];
            if (url) signedUrlsMap[filename] = url;
            else filenamesWithoutInMemoryCacheUrls.push(filename);
        });

        if (filenamesWithoutInMemoryCacheUrls.length === 0)
            return signedUrlsMap;

        const dbUrls =
            await this.firestoreService.getFirestoreDocuments<SignedUrlModel>(
                FIRESTORE_SIGNED_URLS_COLLECTION,
                filenamesWithoutInMemoryCacheUrls.map((f) => pathMap[f]),
                FIRESTORE_SIGNED_URLS_KEY_NAME
            );

        const dbCacheSignedUrls: Record<string, string> = {};
        dbUrls.forEach((dbUrl) => {
            dbCacheSignedUrls[dbUrl[FIRESTORE_SIGNED_URLS_KEY_NAME]] =
                dbUrl.url;
        });

        const filenamesWithoutAnyCacheUrls: string[] = [];

        filenamesWithoutInMemoryCacheUrls.forEach((filename) => {
            const url = dbCacheSignedUrls[pathMap[filename]];
            if (url) {
                signedUrlsMap[filename] = url;
                inMemoryCacheSignedUrlsMap[pathMap[filename]] = url;
            } else filenamesWithoutAnyCacheUrls.push(filename);
        });

        if (filenamesWithoutAnyCacheUrls.length === 0) return signedUrlsMap;

        const newSignedUrls: SignedUrlModel[] = [];

        console.time(
            `GOOGLE CLOUD STORAGE: getSignedUrlsMap.getSignedUrl (${filenamesWithoutAnyCacheUrls.length})`
        );
        const batchSize = 5;
        for (
            let i = 0;
            i < filenamesWithoutAnyCacheUrls.length;
            i += batchSize
        ) {
            const batch = filenamesWithoutAnyCacheUrls.slice(i, i + batchSize);

            await Promise.all(
                batch.map(async (filename) => {
                    const filePath = pathMap[filename];

                    if (!filePath) return;

                    const url = await this.getSignedUrl(filePath);

                    signedUrlsMap[filename] = url;
                    if (url) {
                        inMemoryCacheSignedUrlsMap[pathMap[filename]] = url;
                        newSignedUrls.push({
                            [FIRESTORE_SIGNED_URLS_KEY_NAME]: pathMap[filename],
                            url: signedUrlsMap[filename],
                        });
                    }
                })
            );
        }
        console.timeEnd(
            `GOOGLE CLOUD STORAGE: getSignedUrlsMap.getSignedUrl (${filenamesWithoutAnyCacheUrls.length})`
        );

        await this.cacheService.set(
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

            return {
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
        });

        await this.firestoreService.writeFirestoreDocuments(
            FIRESTORE_ALBUMS_COLLECTION,
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

        const updatedAlbumsMap: Record<string, Omit<UpdatedAlbum, 'path'>> = {};
        updatedAlbums.forEach((updatedAlbum) => {
            const { path, ...rest } = updatedAlbum;

            updatedAlbumsMap[path] = {
                ...(updatedAlbumsMap[path] ?? {}),
                ...rest,
            };
        });

        const appliedUpdatesAlbums: AlbumModel[] = dbAlbums.map((dbAlbum) => {
            const updatedAlbum = updatedAlbumsMap[dbAlbum.path];

            return {
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
                ...(updatedAlbum.order !== undefined
                    ? { order: updatedAlbum.order }
                    : {}),
                ...(updatedAlbum.accesses !== undefined
                    ? {
                          accesses: updatedAlbum.accesses,
                      }
                    : {}),
            };
        });

        await this.firestoreService.writeFirestoreDocuments<AlbumModel>(
            FIRESTORE_ALBUMS_COLLECTION,
            appliedUpdatesAlbums,
            FIRESTORE_ALBUMS_KEY_NAME
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
