import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { EditGuard } from './edit.guard';
import { StorageService } from '../storage/storage.service';
import {
    AddedAlbumDTO,
    AlbumModel,
    FileModel,
    RemovedAlbumDTO,
    RemovedFileDTO,
    UpdatedAlbumDTO,
    UpdatedFileDTO,
} from '../types';
import { Public } from '../common/public';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import { User } from '../common/user';
import { getAlbumAccesses, hasAccessToFile } from '../helper';

const URL_BATCH_SIZE = 100;
const ACCESS_BATCH_SIZE = 200;
const PUBLIC_URL = 'https://storage.googleapis.com/zinovik-gallery';

@Controller('edit')
@UseGuards(EditGuard)
export class EditController {
    constructor(private readonly storageService: StorageService) {}

    private getPublicFilenames(files: FileModel[], albums: AlbumModel[]) {
        const albumAccesses = getAlbumAccesses(albums);

        return files
            .filter((file) => hasAccessToFile([], file, albumAccesses))
            .map((file) => file.filename);
    }

    private getFilename(filePath: string) {
        return filePath.split('/').pop();
    }

    private getAccessesToUpdate(
        filePathsIsPublic: {
            filePath: string;
            isPublic: boolean;
        }[],
        files: FileModel[],
        albums: AlbumModel[]
    ) {
        const albumAccesses = getAlbumAccesses(albums);

        const publicFilenamesFromJson = files
            .filter((file) => hasAccessToFile([], file, albumAccesses))
            .map((file) => file.filename);

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

    private async getFilePathsIsPublic(filePaths: string[]): Promise<
        {
            filePath: string;
            isPublic: boolean;
        }[]
    > {
        const filePathsIsPublic: {
            filePath: string;
            isPublic: boolean;
        }[] = [];

        for (let i = 0; i < filePaths.length; i += ACCESS_BATCH_SIZE) {
            console.log(`- get file access batch starting from ${i}`);
            const promises = filePaths
                .slice(i, i + ACCESS_BATCH_SIZE)
                .map(async (filePath) => ({
                    filePath,
                    isPublic: await this.storageService.getIsPublic(filePath),
                }));

            filePathsIsPublic.push(...(await Promise.all(promises)));
        }
        console.log('- get file access batch done');

        return filePathsIsPublic;
    }

    private async updateStorageFileAccesses(
        storageFilePaths: string[],
        isPublic: boolean
    ) {
        for (let i = 0; i < storageFilePaths.length; i += ACCESS_BATCH_SIZE) {
            console.log(
                `- update ${
                    isPublic ? 'public' : 'private'
                } file access batch starting from ${i}`
            );
            const promises = storageFilePaths
                .slice(i, i + ACCESS_BATCH_SIZE)
                .map(async (storageFilePath) => {
                    if (isPublic) {
                        console.log(`Make PUBLIC: ${storageFilePath}`);
                        await this.storageService.makePublic(storageFilePath);
                    } else {
                        console.log(`Make PRIVATE: ${storageFilePath}`);
                        await this.storageService.makePrivate(storageFilePath);
                    }
                });

            await Promise.all(promises);
        }
        console.log(
            `- update ${isPublic ? 'public' : 'private'} file access batch done`
        );
    }

    @Public() // to skip AuthGuard and EditGuard
    @UseGuards(GoogleAuthGuard)
    @Post('update-file-accesses')
    async updateFileAccesses(
        @Req()
        request: Request & { user?: User }
    ) {
        console.log(
            `service-account email (update-file-accesses): ${request.user?.email}`
        );

        const [filePaths, files, albums] = await Promise.all([
            this.storageService.getFilePaths(),
            this.storageService.getFiles(),
            this.storageService.getAlbums(),
        ]);

        const filePathsIsPublic = await this.getFilePathsIsPublic(filePaths);

        const [makePublicPaths, makePrivatePaths] = this.getAccessesToUpdate(
            filePathsIsPublic,
            files,
            albums
        );

        console.log(makePublicPaths, makePrivatePaths);

        await this.updateStorageFileAccesses(makePublicPaths, true);
        await this.updateStorageFileAccesses(makePrivatePaths, false);

        return { success: true, makePublicPaths, makePrivatePaths };
    }

    @Public() // to skip AuthGuard and EditGuard
    @UseGuards(GoogleAuthGuard)
    @Post('update-sources-config')
    async updateSourcesConfig(
        @Req()
        request: Request & { user?: User }
    ) {
        console.log(
            `service-account email (update-sources-config): ${request.user?.email}`
        );

        const [filePaths, files, albums] = await Promise.all([
            this.storageService.getFilePaths(),
            this.storageService.getFiles(),
            this.storageService.getAlbums(),
        ]);

        const publicFilenames = this.getPublicFilenames(files, albums);

        const sources: {
            filename: string;
            url: string;
        }[] = [];

        for (let i = 0; i < filePaths.length; i += URL_BATCH_SIZE) {
            console.log(`- url batch starting from ${i}`);
            const promises = files
                .slice(i, i + URL_BATCH_SIZE)
                .map(async (file) => {
                    const filePath = filePaths.find((filePath) =>
                        filePath.endsWith(file.filename)
                    );

                    return {
                        url: publicFilenames.includes(file.filename)
                            ? `${PUBLIC_URL}/${filePath}`
                            : await this.storageService.getSignedUrl(filePath),
                        filename: file.filename,
                    };
                });

            const sourcesPart = await Promise.all(promises);

            sources.push(...sourcesPart);
        }
        console.log('- url batch done');

        const sourceConfig: Record<string, string> = {};
        sources.forEach((source) => {
            sourceConfig[source.filename] = source.url;
        });

        await this.storageService.saveSourcesConfig(sourceConfig);

        return { success: true };
    }

    @Post()
    async edit(
        @Body()
        body: {
            remove?: {
                albums?: RemovedAlbumDTO[];
                files?: RemovedFileDTO[];
            };
            add?: {
                albums?: AddedAlbumDTO[];
            };
            update?: {
                albums?: UpdatedAlbumDTO[];
                files?: UpdatedFileDTO[];
            };
        }
    ): Promise<{ result: string }> {
        console.log(JSON.stringify(body));

        const shouldRemoveAlbums =
            body.remove?.albums && body.remove.albums.length > 0;
        const shouldRemoveFiles =
            body.remove?.files && body.remove.files.length > 0;
        const shouldAddAlbums = body.add?.albums && body.add.albums.length > 0;
        const shouldUpdateAlbums =
            body.update?.albums && body.update.albums.length > 0;
        const shouldUpdateFiles =
            body.update?.files && body.update.files.length > 0;

        const [albumsOld, filesOld] = (await Promise.all([
            ...(shouldRemoveAlbums ||
            shouldAddAlbums ||
            shouldUpdateAlbums ||
            shouldRemoveFiles ||
            shouldUpdateFiles
                ? [this.storageService.getAlbums()]
                : []),
            ...(shouldRemoveFiles || shouldUpdateFiles
                ? [this.storageService.getFiles()]
                : []),
        ])) as [AlbumModel[], FileModel[]];

        let mutableAlbumsUpdated = albumsOld;

        // TODO: Save in Promise.all

        if (shouldRemoveAlbums || shouldAddAlbums || shouldUpdateAlbums) {
            const albumsWithoutRemoved = shouldRemoveAlbums
                ? this.removeAlbums(albumsOld, body.remove.albums)
                : albumsOld;
            const albumsWithAdded = shouldAddAlbums
                ? this.addAlbums(albumsWithoutRemoved, body.add.albums)
                : albumsWithoutRemoved;
            const albumsUpdated = shouldUpdateAlbums
                ? this.updateAlbums(albumsWithAdded, body.update.albums)
                : albumsWithAdded;
            const mutableAlbumsUpdated = this.sortAlbums(albumsUpdated);

            await this.storageService.saveAlbums(mutableAlbumsUpdated);
        }

        if (shouldRemoveFiles || shouldUpdateFiles) {
            const filesWithoutRemoved = shouldRemoveFiles
                ? this.removeFiles(filesOld, body.remove.files)
                : filesOld;
            const filesUpdated = shouldUpdateFiles
                ? this.updateFiles(filesWithoutRemoved, body.update.files)
                : filesWithoutRemoved;
            const filesSorted = this.sortFiles(
                filesUpdated,
                mutableAlbumsUpdated
            );

            await this.storageService.saveFiles(filesSorted);
        }

        return { result: 'success' };
    }

    private removeAlbums(
        albums: AlbumModel[],
        removedAlbums: RemovedAlbumDTO[]
    ): AlbumModel[] {
        return albums.filter(
            (album) =>
                !removedAlbums.some(
                    (removedAlbum) => removedAlbum.path === album.path
                )
        );
    }

    private addAlbums(
        albums: AlbumModel[],
        addedAlbums: AddedAlbumDTO[]
    ): AlbumModel[] {
        const albumsWithAdded = [...albums];

        addedAlbums.forEach((addedAlbum) => {
            const relatedPathIndex = albumsWithAdded.findIndex(
                (album) => album.path === addedAlbum.relatedPath
            );

            if (relatedPathIndex === -1) return;

            albumsWithAdded.splice(
                relatedPathIndex + (addedAlbum.relation === 'before' ? 0 : 1),
                0,
                {
                    title: addedAlbum.title,
                    text: addedAlbum.text || undefined,
                    path:
                        addedAlbum.relation === 'in'
                            ? `${addedAlbum.relatedPath}/${addedAlbum.pathPart}`
                            : addedAlbum.relatedPath.split('/').length === 1
                            ? addedAlbum.pathPart
                            : `${addedAlbum.relatedPath.slice(
                                  0,
                                  addedAlbum.relatedPath.lastIndexOf('/')
                              )}/${addedAlbum.pathPart}`,
                }
            );
        });

        return albumsWithAdded;
    }

    private updateAlbums(
        albums: AlbumModel[],
        updateAlbums: UpdatedAlbumDTO[]
    ): AlbumModel[] {
        return albums.map((album) => {
            const updatedAlbum = updateAlbums.find(
                (updatedAlbum) => updatedAlbum.path === album.path
            );

            return updatedAlbum
                ? {
                      ...album,
                      ...(updatedAlbum.newPath
                          ? { path: updatedAlbum.newPath }
                          : {}),
                      ...(updatedAlbum.title
                          ? { title: updatedAlbum.title }
                          : {}),
                      ...(updatedAlbum.text !== undefined
                          ? { text: updatedAlbum.text || undefined }
                          : {}),
                      ...(updatedAlbum.accesses !== undefined
                          ? {
                                accesses:
                                    updatedAlbum.accesses.length > 0
                                        ? updatedAlbum.accesses // TODO: Update real isPublic
                                        : undefined,
                            }
                          : {}),
                  }
                : album;
        });
    }

    private sortAlbums(albums: AlbumModel[]): AlbumModel[] {
        const sortedAlbums = albums
            .filter((album) => album.isSorted)
            .map((album) => album.path);

        const topLevelAlbums = albums
            .filter((album) => album.path.split('/').length === 1)
            .map((album) => album.path);

        return [...albums].sort((a1, a2) => {
            const a1PathParts = a1.path.split('/');
            const a2PathParts = a2.path.split('/');

            if (a1PathParts.length === 1 && a2PathParts.length === 1) {
                return 0;
            }

            if (a1PathParts[0] !== a2PathParts[0]) {
                return (
                    topLevelAlbums.indexOf(a1PathParts[0]) -
                    topLevelAlbums.indexOf(a2PathParts[0])
                );
            }

            // the same root path

            // is sorted album
            if (sortedAlbums.includes(a1PathParts[0])) {
                if (a1PathParts.length === a2PathParts.length)
                    return a1.path.localeCompare(a2.path);

                const minPathParts = Math.min(
                    a1PathParts.length,
                    a2PathParts.length
                );

                for (let i = 0; i < minPathParts; i++) {
                    if (a1PathParts[i] !== a2PathParts[i]) {
                        if (a1PathParts[i] === undefined) return -1;
                        if (a2PathParts[i] === undefined) return 1;
                        return a1PathParts[i].localeCompare(a2PathParts[i]);
                    }
                }
            }

            if (a2.path.includes(a1.path)) return -1;
            if (a1.path.includes(a2.path)) return 1;

            return 0;
        });
    }

    private removeFiles(
        files: FileModel[],
        removedFiles: RemovedFileDTO[]
    ): FileModel[] {
        return files.filter(
            (file) =>
                !removedFiles.some(
                    (removedFile) => removedFile.filename === file.filename
                )
        );
    }

    private updateFiles(
        files: FileModel[],
        updatedFiles: UpdatedFileDTO[]
    ): FileModel[] {
        return files.map((file) => {
            const updatedFile = updatedFiles.find(
                (updatedFile) => updatedFile.filename === file.filename
            );

            return updatedFile
                ? {
                      ...file,
                      ...(updatedFile.path ? { path: updatedFile.path } : {}),
                      ...(updatedFile.isTitle !== undefined
                          ? { isTitle: updatedFile.isTitle || undefined }
                          : {}),
                      ...(updatedFile.description
                          ? { description: updatedFile.description }
                          : {}),
                      ...(updatedFile.text !== undefined
                          ? { text: updatedFile.text || undefined }
                          : {}),
                      ...(updatedFile.accesses !== undefined
                          ? {
                                accesses:
                                    updatedFile.accesses.length > 0
                                        ? updatedFile.accesses // TODO: Update real isPublic
                                        : undefined,
                            }
                          : {}),
                  }
                : file;
        });
    }

    private sortFiles(files: FileModel[], albums: AlbumModel[]): FileModel[] {
        const albumPaths = albums.map((album) => album.path);

        return [...files].sort((f1, f2) =>
            f1.path.split('/')[0] === f2.path.split('/')[0] // the same root path
                ? f1.filename.localeCompare(f2.filename)
                : albumPaths.indexOf(f1.path) - albumPaths.indexOf(f2.path)
        );
    }
}
