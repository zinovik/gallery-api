import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import {
    AddedAlbum,
    AlbumModel,
    FileModel,
    RemovedAlbum,
    RemovedFile,
    UpdatedAlbum,
    UpdatedFile,
} from '../common/album-file.types';
import { sortAlbums, sortFiles } from './helper/sort.helper';

@Injectable()
export class EditService {
    constructor(private readonly storageService: StorageService) {}

    async edit(body: {
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
    }): Promise<{ result: string }> {
        const shouldRemoveAlbums =
            body.remove?.albums && body.remove.albums.length > 0;
        const shouldRemoveFiles =
            body.remove?.files && body.remove.files.length > 0;
        const shouldAddAlbums = body.add?.albums && body.add.albums.length > 0;
        const shouldUpdateAlbums =
            body.update?.albums && body.update.albums.length > 0;
        const shouldUpdateFiles =
            body.update?.files && body.update.files.length > 0;

        const [filesOld, albumsOld] = (await Promise.all([
            ...(shouldRemoveAlbums ||
            shouldAddAlbums ||
            shouldUpdateAlbums ||
            shouldRemoveFiles ||
            shouldUpdateFiles
                ? [this.storageService.getFiles()]
                : []),

            this.storageService.getAlbums(),
        ])) as [FileModel[], AlbumModel[]];

        let mutableFilesUpdated = filesOld;

        // TODO: Save in Promise.all

        if (shouldRemoveFiles || shouldUpdateFiles) {
            const filesWithoutRemoved = shouldRemoveFiles
                ? this.removeFiles(mutableFilesUpdated, body.remove.files)
                : mutableFilesUpdated;
            const filesUpdated = shouldUpdateFiles
                ? this.updateFiles(filesWithoutRemoved, body.update.files)
                : filesWithoutRemoved;
            mutableFilesUpdated = sortFiles(filesUpdated);

            await this.storageService.saveFiles(mutableFilesUpdated);
        }

        const albumsWithoutRemoved = shouldRemoveAlbums
            ? this.removeAlbums(albumsOld, body.remove.albums)
            : albumsOld;
        const albumsWithAdded = shouldAddAlbums
            ? this.addAlbums(albumsWithoutRemoved, body.add.albums)
            : albumsWithoutRemoved;
        const albumsUpdated = shouldUpdateAlbums
            ? this.updateAlbums(albumsWithAdded, body.update.albums)
            : albumsWithAdded;
        const albumsSorted = sortAlbums(albumsUpdated, mutableFilesUpdated);

        await this.storageService.saveAlbums(albumsSorted);

        return { result: 'success' };
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
            albumsWithAdded.push({
                title: addedAlbum.title,
                text: addedAlbum.text || undefined,
                path: addedAlbum.path,
                accesses: addedAlbum.accesses,
            });
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
                      ...(updatedAlbum.order !== undefined
                          ? { order: updatedAlbum.order || undefined }
                          : {}),
                      ...(updatedAlbum.accesses !== undefined
                          ? {
                                accesses: updatedAlbum.accesses, // TODO: Update real isPublic,
                            }
                          : {}),
                  }
                : album;
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
                      ...(updatedFile.description !== undefined
                          ? { description: updatedFile.description }
                          : {}),
                      ...(updatedFile.text !== undefined
                          ? { text: updatedFile.text || undefined }
                          : {}),
                      ...(updatedFile.accesses !== undefined
                          ? {
                                accesses: updatedFile.accesses, // TODO: Update real isPublic,
                            }
                          : {}),
                  }
                : file;
        });
    }
}
