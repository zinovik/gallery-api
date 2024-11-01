import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { getAlbumAccessesSorted, hasAccess } from './helper/access';
import { AlbumDTO, FileDTO } from '../types';

@Injectable()
export class GetService {
    constructor(private readonly storageService: StorageService) {}

    async get(userAccesses: string[]): Promise<{
        albums: AlbumDTO[];
        files: FileDTO[];
    }> {
        const [albums, filesWithoutUrls, sourcesConfig] = await Promise.all([
            this.storageService.getAlbums(),
            this.storageService.getFiles(),
            this.storageService.getSourcesConfig(),
        ]);

        const albumAccessesSorted = getAlbumAccessesSorted(albums);

        const filteredAlbums = albums.filter((album) =>
            hasAccess(
                userAccesses,
                album.accesses,
                album.path,
                albumAccessesSorted
            )
        );

        const filteredFiles = filesWithoutUrls
            .filter((file) =>
                hasAccess(
                    userAccesses,
                    file.accesses,
                    file.path,
                    albumAccessesSorted
                )
            )
            .map((file) => ({
                ...file,
                url: sourcesConfig[file.filename] || file.filename,
            }));

        return {
            files: filteredFiles,
            albums: filteredAlbums.map((album) => ({
                ...album,
                filesAmount: filteredFiles.filter((file) =>
                    this.isThisOrChildPath(file.path, album.path)
                ).length,
            })),
        };
    }

    private isThisOrChildPath(childPath: string, parentPath: string) {
        return (
            childPath === parentPath || childPath.startsWith(`${parentPath}/`)
        );
    }
}
