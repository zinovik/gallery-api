import { FieldPath, Firestore } from '@google-cloud/firestore';
import { Storage, File } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import { AlbumModel, FileModel } from '../common/album-file.types';
import { User } from '../common/user.type';

const BUCKET_NAME_JSONS = 'zinovik-gallery';
const BUCKET_NAME_FILES = 'gallery-files';

const USERS_FILE_NAME = 'users.json';
const FILES_FILE_NAME = 'files.json';
const ALBUMS_FILE_NAME = 'albums.json';

const FIRESTORE_DB = 'gallery-db';
const FIRESTORE_COLLECTION = 'signed-urls';

const URL_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days - maximum

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
            this.inMemoryCacheUsers = (await this.getFile(
                BUCKET_NAME_JSONS,
                USERS_FILE_NAME
            )) as User[]; // because we trust our "db";
        }

        return this.inMemoryCacheUsers;
    }

    async getAlbums(): Promise<AlbumModel[]> {
        if (this.inMemoryCacheAlbums.length === 0) {
            this.inMemoryCacheAlbums = (await this.getFile(
                BUCKET_NAME_JSONS,
                ALBUMS_FILE_NAME
            )) as AlbumModel[]; // because we trust our "db"
        }

        return this.inMemoryCacheAlbums;
    }

    async getFiles(): Promise<FileModel[]> {
        if (this.inMemoryCacheFiles.length === 0) {
            this.inMemoryCacheFiles = (await this.getFile(
                BUCKET_NAME_JSONS,
                FILES_FILE_NAME
            )) as FileModel[]; // because we trust our "db"
        }

        return this.inMemoryCacheFiles;
    }

    async getSignedUrlsMap(
        filenames: string[]
    ): Promise<Record<string, string>> {
        const signedUrlsMap: Record<string, string> = {};
        const filenamesWithoutInMemoryCacheUrls: string[] = [];

        filenames.forEach((filename) => {
            const url = this.inMemoryCacheSignedUrls[filename];
            if (url) signedUrlsMap[filename] = url;
            else filenamesWithoutInMemoryCacheUrls.push(filename);
        });

        if (filenamesWithoutInMemoryCacheUrls.length === 0)
            return signedUrlsMap;

        const docs = await this.getFirestoreDocuments<{ url: string }>(
            FIRESTORE_COLLECTION,
            filenamesWithoutInMemoryCacheUrls
        );

        const dbCacheSignedUrls: Record<string, string> = {};
        docs.forEach((doc) => {
            dbCacheSignedUrls[doc.id] = doc.data.url;
        });

        const filenamesWithoutAnyCacheUrls: string[] = [];

        filenamesWithoutInMemoryCacheUrls.forEach((filename) => {
            const url = dbCacheSignedUrls[filename];
            if (url) {
                signedUrlsMap[filename] = url;
                this.inMemoryCacheSignedUrls[filename] = url;
            } else filenamesWithoutAnyCacheUrls.push(filename);
        });

        if (filenamesWithoutAnyCacheUrls.length === 0) return signedUrlsMap;

        const filePaths = await this.getFilePaths();

        const pathMap = Object.fromEntries(
            filePaths.map((path) => [path.split('/').pop(), path])
        );

        const toFirestoreDocs: {
            id: string;
            data: FirebaseFirestore.DocumentData;
        }[] = [];

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
                        this.inMemoryCacheSignedUrls[filename] = url;
                        toFirestoreDocs.push({
                            id: filename,
                            data: { url: signedUrlsMap[filename] },
                        });
                    }
                })
            );
        }

        await this.writeFirestoreDocuments(
            FIRESTORE_COLLECTION,
            toFirestoreDocs,
            URL_TTL
        );

        return signedUrlsMap;
    }

    async saveAlbums(albums: AlbumModel[]): Promise<void> {
        await this.saveFile(BUCKET_NAME_JSONS, ALBUMS_FILE_NAME, albums);
    }

    async saveFiles(files: FileModel[]): Promise<void> {
        await this.saveFile(BUCKET_NAME_JSONS, FILES_FILE_NAME, files);
    }

    async getFilePaths(): Promise<string[]> {
        if (this.inMemoryCacheFilePaths.length === 0) {
            const bucket = this.storage.bucket(BUCKET_NAME_FILES);
            const [files] = await bucket.getFiles();

            this.inMemoryCacheFilePaths = files.map((file) => file.name);
        }

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

    async getFirestoreDocuments<T>(
        collectionName: string,
        documentIds: string[]
    ): Promise<{ id: string; data: T }[]> {
        const chunks = [];

        for (let i = 0; i < documentIds.length; i += 30) {
            chunks.push(documentIds.slice(i, i + 30));
        }

        const results = await Promise.all(
            chunks.map((chunk) =>
                this.firestore
                    .collection(collectionName)
                    .where(FieldPath.documentId(), 'in', chunk)
                    .get()
            )
        );

        return results.flatMap((snapshot) =>
            snapshot.docs.map((doc) => ({
                id: doc.id,
                data: doc.data() as T,
            }))
        );
    }

    async writeFirestoreDocuments(
        collectionName: string,
        documents: { id: string; data: FirebaseFirestore.DocumentData }[],
        ttlMs?: number
    ): Promise<void> {
        const chunks = [];

        for (let i = 0; i < documents.length; i += 500) {
            chunks.push(documents.slice(i, i + 500));
        }

        for (const chunk of chunks) {
            const batch = this.firestore.batch();

            for (const item of chunk) {
                batch.set(
                    this.firestore.collection(collectionName).doc(item.id),
                    {
                        ...item.data,
                        ...(ttlMs && {
                            expiresAt: new Date(Date.now() + ttlMs),
                        }),
                    }
                );
            }

            await batch.commit();
        }
    }
}
