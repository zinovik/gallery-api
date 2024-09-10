import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { EditGuard } from './edit.guard';
import { StorageService } from '../storage/storage.service';
import { GoogleAuth } from 'google-auth-library';
import {
    ALBUMS_FILE_NAME,
    BUCKET_NAME,
    FILES_FILE_NAME,
    MEDIA_URLS_UPDATER,
    SOURCES_CONFIG_FILE_NAME,
} from '../config';
import {
    AddedAlbum,
    AlbumModel,
    FileModel,
    RemovedAlbum,
    RemovedFile,
    UpdatedAlbum,
    UpdatedFile,
} from '../types';

const getFolderFromUrl = (url: string, filename: string): string => {
    const [folderPath] = url.split(`/${filename}`);

    return folderPath.split('/').pop();
};

@Controller('edit')
@UseGuards(new EditGuard())
export class EditController {
    constructor(private readonly storageService: StorageService) {}

    @Post('media-urls-updater')
    async mediaUrlsUpdater() {
        const auth = new GoogleAuth();
        const client = await auth.getIdTokenClient(MEDIA_URLS_UPDATER);

        const { data } = await client.request({
            url: MEDIA_URLS_UPDATER,
            method: 'GET',
        });

        return data;
    }

    @Post('add-new-files')
    async addNewFiles() {
        const albums: AlbumModel[] = (await this.storageService.getFile(
            BUCKET_NAME,
            ALBUMS_FILE_NAME
        )) as AlbumModel[];
        const files: FileModel[] = (await this.storageService.getFile(
            BUCKET_NAME,
            FILES_FILE_NAME
        )) as FileModel[];
        const sourcesConfig: Record<string, string> =
            (await this.storageService.getFile(
                BUCKET_NAME,
                SOURCES_CONFIG_FILE_NAME
            )) as Record<string, string>;

        const newSources = Object.keys(sourcesConfig)
            .filter(
                (filename) => !files.some((file) => file.filename === filename)
            )
            .map((filename) => ({
                filename,
                folder: getFolderFromUrl(sourcesConfig[filename], filename),
            }));

        console.log(
            'NEW FILENAMES:',
            newSources.map((source) => source.filename).join(', ')
        );

        if (newSources.length > 0) {
            files.push(
                ...newSources.map((source) => ({
                    path: `${source.folder}/unsorted`,
                    filename: source.filename,
                    description: '',
                }))
            );
        }

        const newPaths = [
            ...new Set(
                files
                    .filter(
                        (file) =>
                            !albums.some((album) => album.path === file.path)
                    )
                    .map((file) => file.path)
            ),
        ];

        console.log('NEW PATHS:', newPaths.join(', '));

        if (newPaths.length > 0) {
            albums.push(
                ...newPaths.map((path) => {
                    const [_, ...parts] = path.split('/');

                    return {
                        title: parts.join('/'),
                        path,
                    };
                })
            );
        }

        await this.storageService.saveFile(
            BUCKET_NAME,
            FILES_FILE_NAME,
            this.sortFiles(files, albums)
        );

        await this.storageService.saveFile(
            BUCKET_NAME,
            FILES_FILE_NAME,
            this.sortAlbums(albums)
        );
    }

    @Post()
    async edit(
        @Body()
        body: {
            remove?: {
                albums?: RemovedAlbum[];
                files?: RemovedFile[];
            };
            add?: {
                albums?: AddedAlbum[];
            };
            update?: {
                albums?: UpdatedAlbum[];
                files?: UpdatedFile[];
            };
        }
    ): Promise<void> {
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
                ? [this.storageService.getFile(BUCKET_NAME, ALBUMS_FILE_NAME)]
                : []),
            ...(shouldRemoveFiles || shouldUpdateFiles
                ? [this.storageService.getFile(BUCKET_NAME, FILES_FILE_NAME)]
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

            await this.storageService.saveFile(
                BUCKET_NAME,
                ALBUMS_FILE_NAME,
                mutableAlbumsUpdated
            );
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

            await this.storageService.saveFile(
                BUCKET_NAME,
                FILES_FILE_NAME,
                filesSorted
            );
        }
    }

    private removeAlbums(
        albums: AlbumModel[],
        removedAlbums: RemovedAlbum[]
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
        addedAlbums: AddedAlbum[]
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
        updateAlbums: UpdatedAlbum[]
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
        removedFiles: RemovedFile[]
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
        updatedFiles: UpdatedFile[]
    ): FileModel[] {
        return files.map((file) => {
            const updatedFile = updatedFiles.find(
                (updatedFile) => updatedFile.filename === file.filename
            );

            return updatedFile
                ? {
                      ...file,
                      ...(updatedFile.path ? { path: updatedFile.path } : {}),
                      ...(updatedFile.description
                          ? { description: updatedFile.description }
                          : {}),
                      ...(updatedFile.text !== undefined
                          ? { text: updatedFile.text || undefined }
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
