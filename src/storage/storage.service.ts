import { FieldPath, Firestore } from '@google-cloud/firestore';
import { Storage, File } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import {
    AddedAlbum,
    AlbumModel,
    FileModel,
    UpdatedAlbum,
    UpdatedFile,
} from '../common/album-file.types';
import { User } from '../common/user.type';

const BUCKET_NAME_FILES = 'gallery-files';

const FIRESTORE_DB = 'gallery-db';
const SLASH = '___';

const FIRESTORE_FILES_COLLECTION = 'files';
const FIRESTORE_FILES_KEY_NAME = 'filename';
const FIRESTORE_ALBUMS_COLLECTION = 'albums';
const FIRESTORE_ALBUMS_KEY_NAME = 'path';
const FIRESTORE_USERS_COLLECTION = 'users';
const FIRESTORE_USERS_KEY_NAME = 'email';
const FIRESTORE_SIGNED_URLS_COLLECTION = 'signed-urls';

const URL_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days - maximum

const KEY_NAME = 'storagePath';
type SignedUrlModel = {
    [KEY_NAME]: string;
    url: string;
};

@Injectable()
export class StorageService {
    private readonly storage: Storage = new Storage();
    private readonly firestore: Firestore = new Firestore({
        databaseId: FIRESTORE_DB,
    });

    private inMemoryCacheUsers: User[] = [];
    private inMemoryCacheAlbums: AlbumModel[] = [];
    private inMemoryCacheFiles: FileModel[] = [];

    private inMemoryCacheFilePaths: string[] = [];

    private readonly inMemoryCacheSignedUrls: Record<string, string> = {};

    async getUsers(): Promise<User[]> {
        if (this.inMemoryCacheUsers.length === 0) {
            this.inMemoryCacheUsers = (await this.getAllFirestoreDocuments(
                FIRESTORE_USERS_COLLECTION,
                FIRESTORE_USERS_KEY_NAME
            )) as User[]; // because we trust our "db";
        }

        return this.inMemoryCacheUsers;
    }

    async getAlbums(): Promise<AlbumModel[]> {
        console.time('getAlbums');
        if (this.inMemoryCacheAlbums.length === 0) {
            this.inMemoryCacheAlbums = (await this.getAllFirestoreDocuments(
                FIRESTORE_ALBUMS_COLLECTION,
                FIRESTORE_ALBUMS_KEY_NAME
            )) as AlbumModel[]; // because we trust our "db"
        }
        console.timeEnd('getAlbums');

        return this.inMemoryCacheAlbums;
    }

    async getFiles(): Promise<FileModel[]> {
        console.time('getFiles');
        if (this.inMemoryCacheFiles.length === 0) {
            this.inMemoryCacheFiles = (await this.getAllFirestoreDocuments(
                FIRESTORE_FILES_COLLECTION,
                FIRESTORE_FILES_KEY_NAME
            )) as FileModel[]; // because we trust our "db"
        }
        console.timeEnd('getFiles');

        return this.inMemoryCacheFiles;
    }

    async getSignedUrlsMap(
        filenames: string[]
    ): Promise<Record<string, string>> {
        const filePaths = await this.getFilePaths();

        const pathMap = Object.fromEntries(
            filePaths.map((path) => [path.split('/').pop(), path])
        );

        const signedUrlsMap: Record<string, string> = {};
        const filenamesWithoutInMemoryCacheUrls: string[] = [];

        filenames.forEach((filename) => {
            const url = this.inMemoryCacheSignedUrls[pathMap[filename]];
            if (url) signedUrlsMap[filename] = url;
            else filenamesWithoutInMemoryCacheUrls.push(filename);
        });

        if (filenamesWithoutInMemoryCacheUrls.length === 0)
            return signedUrlsMap;

        const dbUrls = await this.getFirestoreDocuments<SignedUrlModel>(
            FIRESTORE_SIGNED_URLS_COLLECTION,
            filenamesWithoutInMemoryCacheUrls.map((f) => pathMap[f]),
            KEY_NAME
        );

        const dbCacheSignedUrls: Record<string, string> = {};
        dbUrls.forEach((dbUrl) => {
            dbCacheSignedUrls[dbUrl[KEY_NAME]] = dbUrl.url;
        });

        const filenamesWithoutAnyCacheUrls: string[] = [];

        filenamesWithoutInMemoryCacheUrls.forEach((filename) => {
            const url = dbCacheSignedUrls[pathMap[filename]];
            if (url) {
                signedUrlsMap[filename] = url;
                this.inMemoryCacheSignedUrls[pathMap[filename]] = url;
            } else filenamesWithoutAnyCacheUrls.push(filename);
        });

        if (filenamesWithoutAnyCacheUrls.length === 0) return signedUrlsMap;

        const dbUrlsToSave: SignedUrlModel[] = [];

        console.time('signedUrlsMap - getSignedUrls');
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
                        this.inMemoryCacheSignedUrls[pathMap[filename]] = url;
                        dbUrlsToSave.push({
                            [KEY_NAME]: pathMap[filename],
                            url: signedUrlsMap[filename],
                        });
                    }
                })
            );
        }
        console.timeEnd('signedUrlsMap - getSignedUrls');

        await this.writeFirestoreDocuments<SignedUrlModel>(
            FIRESTORE_SIGNED_URLS_COLLECTION,
            dbUrlsToSave,
            KEY_NAME,
            URL_TTL
        );

        return signedUrlsMap;
    }

    async getFilePaths(): Promise<string[]> {
        console.time('getFilePaths');
        if (this.inMemoryCacheFilePaths.length === 0) {
            const bucket = this.storage.bucket(BUCKET_NAME_FILES);
            const [files] = await bucket.getFiles();

            this.inMemoryCacheFilePaths = files.map((file) => file.name);
        }
        console.timeEnd('getFilePaths');

        return this.inMemoryCacheFilePaths;
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

    private async getFile(
        bucketName: string,
        fileName: string
    ): Promise<Object> {
        const bucket = this.storage.bucket(bucketName);
        const file = await bucket.file(fileName).download();

        return JSON.parse(file.toString());
    }

    private async saveFile(
        bucketName: string,
        fileName: string,
        file: Object
    ): Promise<void> {
        const bucket = this.storage.bucket(bucketName);
        const bucketFile: File = bucket.file(fileName);
        const dataBuffer = Buffer.from(JSON.stringify(file));

        await bucketFile.save(dataBuffer, {
            gzip: true,
            public: false,
            resumable: true,
            contentType: 'application/json',
            metadata: {
                cacheControl: 'no-cache',
            },
        });
    }

    async removeFiles(filenames?: string[]) {
        if (!filenames || filenames.length === 0) return;

        await this.removeFirestoreDocuments(FIRESTORE_FILES_COLLECTION, [
            ...new Set(filenames),
        ]);
    }

    async removeAlbums(paths?: string[]) {
        if (!paths || paths.length === 0) return;

        await this.removeFirestoreDocuments(FIRESTORE_ALBUMS_COLLECTION, [
            ...new Set(paths),
        ]);
    }

    async updateFiles(updatedFiles?: UpdatedFile[]) {
        if (!updatedFiles || updatedFiles.length === 0) return;

        const filenames = updatedFiles.map((f) => f.filename);

        const dbFiles = await this.getFirestoreDocuments<FileModel>(
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

        await this.writeFirestoreDocuments(
            FIRESTORE_ALBUMS_COLLECTION,
            appliedUpdatesFiles,
            FIRESTORE_FILES_KEY_NAME
        );
    }

    async updateAlbums(updatedAlbums?: UpdatedAlbum[]) {
        if (!updatedAlbums || updatedAlbums.length === 0) return;

        const paths = updatedAlbums.map((a) => a.path);

        const dbAlbums = await this.getFirestoreDocuments<AlbumModel>(
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

        await this.writeFirestoreDocuments<AlbumModel>(
            FIRESTORE_ALBUMS_COLLECTION,
            appliedUpdatesAlbums,
            FIRESTORE_ALBUMS_KEY_NAME
        );
    }

    async addAlbums(albums?: AddedAlbum[]) {
        if (!albums || albums.length === 0) return;

        await this.writeFirestoreDocuments<AlbumModel>(
            FIRESTORE_ALBUMS_COLLECTION,
            albums,
            FIRESTORE_ALBUMS_KEY_NAME
        );
    }

    private async getAllFirestoreDocuments<
        T extends FirebaseFirestore.DocumentData,
    >(collectionName: string, keyName: string): Promise<T[]> {
        const snapshot = await this.firestore.collection(collectionName).get();

        return snapshot.docs.map(
            (doc) =>
                ({
                    ...doc.data(),
                    [keyName]: doc.id.replace(new RegExp(SLASH, 'g'), '/'),
                }) as T
        );
    }

    private async getFirestoreDocuments<
        T extends FirebaseFirestore.DocumentData,
    >(
        collectionName: string,
        documentIds: string[],
        keyName: string
    ): Promise<T[]> {
        const chunks = [];

        for (let i = 0; i < documentIds.length; i += 30) {
            chunks.push(
                documentIds
                    .slice(i, i + 30)
                    .map((documentId) => documentId.replace(/\//g, SLASH))
            );
        }

        const snapshots = await Promise.all(
            chunks.map((chunk) =>
                this.firestore
                    .collection(collectionName)
                    .where(FieldPath.documentId(), 'in', chunk)
                    .get()
            )
        );

        return snapshots.flatMap((snapshot) =>
            snapshot.docs.map(
                (doc) =>
                    ({
                        [keyName]: doc.id.replace(new RegExp(SLASH, 'g'), '/'),
                        ...doc.data(),
                    }) as T
            )
        );
    }

    private async writeFirestoreDocuments<
        T extends FirebaseFirestore.DocumentData,
    >(
        collectionName: string,
        documents: T[],
        keyName: string,
        ttlMs?: number
    ): Promise<void> {
        const chunks = [];

        for (let i = 0; i < documents.length; i += 500) {
            chunks.push(documents.slice(i, i + 500));
        }

        for (const chunk of chunks) {
            const batch = this.firestore.batch();

            for (const item of chunk) {
                const { [keyName]: id, ...data } = item;

                batch.set(
                    this.firestore
                        .collection(collectionName)
                        .doc(id.replace(/\//g, SLASH)),
                    {
                        ...data,
                        ...(ttlMs && {
                            expiresAt: new Date(Date.now() + ttlMs),
                        }),
                    }
                );
            }

            await batch.commit();
        }
    }

    private async removeFirestoreDocuments(
        collectionName: string,
        documentIds: string[]
    ): Promise<void> {
        const chunks = [];

        for (let i = 0; i < documentIds.length; i += 30) {
            chunks.push(
                documentIds
                    .slice(i, i + 30)
                    .map((documentId) => documentId.replace(/\//g, SLASH))
            );
        }

        const snapshots = await Promise.all(
            chunks.map((chunk) =>
                this.firestore
                    .collection(collectionName)
                    .where(FieldPath.documentId(), 'in', chunk)
                    .get()
            )
        );

        const docs = snapshots.flatMap((snapshot) => snapshot.docs);

        if (docs.length === 0) return;

        for (let i = 0; i < docs.length; i += 500) {
            const batch = this.firestore.batch();

            docs.slice(i, i + 500).forEach((doc) => {
                batch.delete(doc.ref);
            });

            await batch.commit();
        }
    }
}
