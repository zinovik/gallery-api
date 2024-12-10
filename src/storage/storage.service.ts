import { Storage, File } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import { AlbumModel, FileModel } from '../common/album-file.types';
import { User } from '../common/user.type';

const BUCKET_NAME = 'zinovik-gallery';
const USERS_FILE_NAME = 'users.json';
const FILES_FILE_NAME = 'files.json';
const ALBUMS_FILE_NAME = 'albums.json';
const SOURCES_CONFIG_FILE_NAME = 'sources-config.json';

@Injectable()
export class StorageService {
    private readonly storage: Storage = new Storage();

    async getUsers(): Promise<User[]> {
        return (await this.getFile(BUCKET_NAME, USERS_FILE_NAME)) as User[]; // because we trust our "db"
    }

    async getAlbums(): Promise<AlbumModel[]> {
        return (await this.getFile(
            BUCKET_NAME,
            ALBUMS_FILE_NAME
        )) as AlbumModel[]; // because we trust our "db"
    }

    async getFiles(): Promise<FileModel[]> {
        return (await this.getFile(
            BUCKET_NAME,
            FILES_FILE_NAME
        )) as FileModel[]; // because we trust our "db"
    }

    async getSourcesConfig(): Promise<Record<string, string>> {
        return (await this.getFile(
            BUCKET_NAME,
            SOURCES_CONFIG_FILE_NAME
        )) as Record<string, string>; // because we trust our "db"
    }

    async saveAlbums(albums: AlbumModel[]): Promise<void> {
        await this.saveFile(BUCKET_NAME, ALBUMS_FILE_NAME, albums);
    }

    async saveFiles(files: FileModel[]): Promise<void> {
        await this.saveFile(BUCKET_NAME, FILES_FILE_NAME, files);
    }

    async getFilePaths(): Promise<string[]> {
        const bucket = this.storage.bucket(BUCKET_NAME);
        const [files] = await bucket.getFiles();

        return files.map((file) => file.name);
    }

    async getSignedUrl(filePath: string): Promise<string> {
        const bucket = this.storage.bucket(BUCKET_NAME);
        const [url] = await bucket.file(filePath).getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days - maximum
        });

        return url;
    }

    async saveSourcesConfig(
        sourcesConfig: Record<string, string>
    ): Promise<void> {
        await this.saveFile(
            BUCKET_NAME,
            SOURCES_CONFIG_FILE_NAME,
            sourcesConfig
        );
    }

    async getIsPublic(storageFilePath: string): Promise<boolean> {
        const bucket = this.storage.bucket(BUCKET_NAME);
        const file = bucket.file(storageFilePath);
        const [acl] = await file.acl.get();

        return Array.isArray(acl)
            ? acl.some(
                  (entry) =>
                      entry.entity === 'allUsers' && entry.role === 'READER'
              )
            : acl.entity === 'allUsers' && acl.role === 'READER';
    }

    async makePublic(storageFilePath: string) {
        const bucket = this.storage.bucket(BUCKET_NAME);
        await bucket.file(storageFilePath).makePublic();
    }

    async makePrivate(storageFilePath: string) {
        const bucket = this.storage.bucket(BUCKET_NAME);
        await bucket.file(storageFilePath).makePrivate({ strict: true });
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
