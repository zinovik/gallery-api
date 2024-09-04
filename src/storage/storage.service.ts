import { Storage, File } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';

@Injectable()
export class StorageService {
    private readonly storage: Storage = new Storage();

    async getBucketNames(): Promise<string[]> {
        const [buckets] = await this.storage.getBuckets();

        return buckets.map((bucket) => bucket.name);
    }

    async getFileNames(bucketName: string): Promise<string[]> {
        const [files] = await this.storage.bucket(bucketName).getFiles();

        return files.map((file) => file.name);
    }

    async getFile(bucketName: string, fileName: string): Promise<Object> {
        const bucket = this.storage.bucket(bucketName);
        const file = await bucket.file(fileName).download();

        return JSON.parse(file.toString());
    }

    async saveFile(
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
