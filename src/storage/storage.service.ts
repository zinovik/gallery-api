import { Storage, File } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import { AlbumModel, FileModel } from '../types';

const BUCKET_NAME = 'zinovik-gallery';
const FILES_FILE_NAME = 'files.json';
const ALBUMS_FILE_NAME = 'albums.json';
const SOURCES_CONFIG_FILE_NAME = 'sources-config.json';

@Injectable()
export class StorageService {
    private readonly storage: Storage = new Storage();

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

    async saveSourcesConfig(
        sourcesConfig: Promise<Record<string, string>>
    ): Promise<void> {
        await this.saveFile(
            BUCKET_NAME,
            SOURCES_CONFIG_FILE_NAME,
            sourcesConfig
        );
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
