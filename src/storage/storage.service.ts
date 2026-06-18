import { Storage, File } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import { AlbumModel, FileModel } from '../common/album-file.types';
import { User } from '../common/user.type';

const BUCKET_NAME_JSONS = 'zinovik-gallery';
const BUCKET_NAME_FILES = 'gallery-files';
const USERS_FILE_NAME = 'users.json';
const FILES_FILE_NAME = 'files.json';
const ALBUMS_FILE_NAME = 'albums.json';

@Injectable()
export class StorageService {
    private readonly storage: Storage = new Storage();

    private readonly inMemoryCacheUrls: Record<string, string> = {};

    private inMemoryCachePathMap: Record<string, string> = {};

    private inMemoryCacheFilePaths: string[] = [];
    private inMemoryCacheFilePathsTimestamp: number = 0;
    private readonly CACHE_VALIDITY_MS = 15 * 60 * 1000; // 15 minutes

    async getUsers(): Promise<User[]> {
        return (await this.getFile(
            BUCKET_NAME_JSONS,
            USERS_FILE_NAME
        )) as User[]; // because we trust our "db"
    }

    async getAlbums(): Promise<AlbumModel[]> {
        return (await this.getFile(
            BUCKET_NAME_JSONS,
            ALBUMS_FILE_NAME
        )) as AlbumModel[]; // because we trust our "db"
    }

    async getFiles(): Promise<FileModel[]> {
        return (await this.getFile(
            BUCKET_NAME_JSONS,
            FILES_FILE_NAME
        )) as FileModel[]; // because we trust our "db"
    }

    async getSourcesConfig(
        files: FileModel[]
    ): Promise<Record<string, string>> {
        const sourceConfig: Record<string, string> = {};
        const filesWithoutUrls: FileModel[] = [];

        files.forEach((file) => {
            if (this.inMemoryCacheUrls[file.filename]) {
                sourceConfig[file.filename] =
                    this.inMemoryCacheUrls[file.filename];
            } else {
                filesWithoutUrls.push(file);
            }
        });

        if (filesWithoutUrls.length === 0) {
            return sourceConfig;
        }

        if (Object.keys(this.inMemoryCachePathMap).length === 0) {
            const filePaths = await this.getFilePaths();

            this.inMemoryCachePathMap = Object.fromEntries(
                filePaths.map((path) => [path.split('/').pop(), path])
            );
        }

        await Promise.all(
            filesWithoutUrls.map(async (file) => {
                const filePath = this.inMemoryCachePathMap[file.filename];

                if (!filePath) return;

                if (!this.inMemoryCacheUrls[file.filename]) {
                    this.inMemoryCacheUrls[file.filename] =
                        await this.getSignedUrl(filePath);
                }

                sourceConfig[file.filename] =
                    this.inMemoryCacheUrls[file.filename];
            })
        );

        return sourceConfig;
    }

    async saveAlbums(albums: AlbumModel[]): Promise<void> {
        await this.saveFile(BUCKET_NAME_JSONS, ALBUMS_FILE_NAME, albums);
    }

    async saveFiles(files: FileModel[]): Promise<void> {
        await this.saveFile(BUCKET_NAME_JSONS, FILES_FILE_NAME, files);
    }

    async getFilePaths(): Promise<string[]> {
        const now = Date.now();

        if (
            this.inMemoryCacheFilePaths.length === 0 ||
            now - this.inMemoryCacheFilePathsTimestamp >= this.CACHE_VALIDITY_MS
        ) {
            const bucket = this.storage.bucket(BUCKET_NAME_FILES);
            const [files] = await bucket.getFiles();

            this.inMemoryCacheFilePaths = files.map((file) => file.name);
            this.inMemoryCacheFilePathsTimestamp = now;
        }

        return this.inMemoryCacheFilePaths;
    }

    private async getSignedUrl(filePath: string): Promise<string> {
        const bucket = this.storage.bucket(BUCKET_NAME_FILES);
        const [url] = await bucket.file(filePath).getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days - maximum
        });

        return url;
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
}
