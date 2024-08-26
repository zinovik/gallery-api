import { Storage, File } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';

const PUBLIC_BUCKETS = ['digital-board-games', 'zinovik-gallery'];
const SORTED_FILES: string[] = [];

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
    ): Promise<{ url: string }> {
        const bucket = this.storage.bucket(bucketName);
        const bucketFile: File = bucket.file(fileName);
        const dataBuffer = Buffer.from(
            JSON.stringify(
                SORTED_FILES.includes(fileName) ? this.sortKeys(file) : file
            )
        );

        const isPublic = PUBLIC_BUCKETS.includes(bucketName);

        await bucketFile.save(dataBuffer, {
            gzip: true,
            public: isPublic,
            resumable: true,
            contentType: 'application/json',
            metadata: {
                cacheControl: 'no-cache',
            },
        });

        return {
            url: isPublic
                ? `https://storage.googleapis.com/${bucketName}/${fileName}`
                : '',
        };
    }

    private sortKeys(object: Object) {
        return (Object.keys(object) as Array<keyof typeof object>)
            .sort((key1, key2) => key1.localeCompare(key2))
            .reduce(
                (acc, key) => ({
                    ...acc,
                    [key]: object[key],
                }),
                {}
            );
    }
}
