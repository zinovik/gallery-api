import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { AlbumModel, FileModel } from '../common/album-file.types';
import { sortAlbums, sortFiles } from './helper/sort.helper';
import { getPublicFilenames } from './helper/access.helper';
import { performBatch } from './helper/batch.helper';

const URL_BATCH_SIZE = 100;
const ACCESS_BATCH_SIZE = 200;
const PUBLIC_URL = 'https://storage.googleapis.com/zinovik-gallery';

@Injectable()
export class UtilsService {
    constructor(private readonly storageService: StorageService) {}

    async updateFileAccesses(): Promise<{
        makePublicPaths: string[];
        makePrivatePaths: string[];
    }> {
        const [filePaths, files] = await Promise.all([
            this.storageService.getFilePaths(),
            this.storageService.getFiles(),
        ]);

        const filePathsIsPublic = await this.getFilePathsIsPublic(filePaths);

        const [makePublicPaths, makePrivatePaths] = this.getAccessesToUpdate(
            filePathsIsPublic,
            files
        );

        console.log(makePublicPaths, makePrivatePaths);

        await this.updateStorageFileAccesses(makePublicPaths, true);
        await this.updateStorageFileAccesses(makePrivatePaths, false);

        return { makePublicPaths, makePrivatePaths };
    }

    private async getFilePathsIsPublic(filePaths: string[]): Promise<
        {
            filePath: string;
            isPublic: boolean;
        }[]
    > {
        const filePathsIsPublic: {
            filePath: string;
            isPublic: boolean;
        }[] = await performBatch(
            filePaths,
            async (filePath) => ({
                filePath,
                isPublic: await this.storageService.getIsPublic(filePath),
            }),
            ACCESS_BATCH_SIZE,
            'get file access'
        );

        return filePathsIsPublic;
    }

    private getAccessesToUpdate(
        filePathsIsPublic: {
            filePath: string;
            isPublic: boolean;
        }[],
        files: FileModel[]
    ) {
        const publicFilenamesFromJson = getPublicFilenames(files);

        const makePublicPaths: string[] = [];
        const makePrivatePaths: string[] = [];

        filePathsIsPublic.forEach(({ isPublic, filePath }) => {
            if (
                !isPublic &&
                publicFilenamesFromJson.includes(this.getFilename(filePath))
            )
                makePublicPaths.push(filePath);

            if (
                isPublic &&
                !publicFilenamesFromJson.includes(this.getFilename(filePath))
            )
                makePrivatePaths.push(filePath);
        });

        return [makePublicPaths, makePrivatePaths];
    }

    private getFilename(filePath: string): string {
        return filePath.split('/').pop();
    }

    private async updateStorageFileAccesses(
        storageFilePaths: string[],
        isPublic: boolean
    ) {
        await performBatch(
            storageFilePaths,
            async (storageFilePath) => {
                if (isPublic) {
                    console.log(`Make PUBLIC: ${storageFilePath}`);
                    await this.storageService.makePublic(storageFilePath);
                } else {
                    console.log(`Make PRIVATE: ${storageFilePath}`);
                    await this.storageService.makePrivate(storageFilePath);
                }
            },
            ACCESS_BATCH_SIZE,
            `update ${isPublic ? 'public' : 'private'} file access`
        );
    }

    async updateSourcesConfig() {
        const [filePaths, files] = await Promise.all([
            this.storageService.getFilePaths(),
            this.storageService.getFiles(),
        ]);

        const publicFilenames = getPublicFilenames(files);

        const sources: {
            filename: string;
            url: string;
        }[] = await performBatch(
            files,
            async (file) => {
                const filePath = filePaths.find((filePath) =>
                    filePath.endsWith(`/${file.filename}`)
                );

                return {
                    url:
                        publicFilenames.includes(file.filename) || !filePath
                            ? `${PUBLIC_URL}/${filePath}`
                            : await this.storageService.getSignedUrl(filePath),
                    filename: file.filename,
                };
            },
            URL_BATCH_SIZE,
            'url'
        );

        const sourceConfig: Record<string, string> = {};
        sources.forEach((source) => {
            sourceConfig[source.filename] = source.url;
        });

        await this.storageService.saveSourcesConfig(sourceConfig);

        return { success: true };
    }

    async sortAndSaveAlbumsAndFiles(
        files: FileModel[],
        albumsArg?: AlbumModel[]
    ): Promise<void> {
        const albums = albumsArg || (await this.storageService.getAlbums());

        const filesSorted = sortFiles(files);
        const albumsSorted = sortAlbums(albums, filesSorted);

        await this.storageService.saveAlbums(albumsSorted);
        await this.storageService.saveFiles(filesSorted);
    }
}
