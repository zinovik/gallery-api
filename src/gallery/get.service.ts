import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { getAlbumAccessesSorted, hasAccess } from './helper/access.helper';
import { Album, File } from '../common/album-file.types';

@Injectable()
export class GetService {
    constructor(private readonly storageService: StorageService) {}

    async get(
        mainPath: string,
        userAccesses: string[],
        accessedPath: string,
        isHomeOnly: boolean,
        isHomeInclude: boolean
    ): Promise<{
        albums: Album[];
        files: File[];
    }> {
        const [albums, filesWithoutUrls, sourcesConfig] = await Promise.all([
            this.storageService.getAlbums(),
            this.storageService.getFiles(),
            this.storageService.getSourcesConfig(),
        ]);

        const albumAccessesSorted = getAlbumAccessesSorted(albums);

        const accessibleAlbums = albums.filter((album) =>
            hasAccess(
                userAccesses,
                accessedPath,
                album.accesses,
                album.path,
                albumAccessesSorted
            )
        );

        const accessibleFiles = filesWithoutUrls
            .filter((file) =>
                hasAccess(
                    userAccesses,
                    accessedPath,
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
            files: isHomeOnly
                ? []
                : mainPath
                ? accessibleFiles.filter(
                      (file) => file.path.split('/')[0] === mainPath
                  )
                : accessibleFiles,
            albums: (mainPath || isHomeOnly
                ? accessibleAlbums.filter(
                      (album) =>
                          (isHomeInclude && this.isHomePath(album.path)) ||
                          (!isHomeOnly && album.path.split('/')[0] === mainPath)
                  )
                : accessibleAlbums
            ).map((album) => ({
                ...album,
                filesAmount: accessibleFiles.filter((file) =>
                    this.isThisOrChildPath(file.path, album.path)
                ).length,
            })),
        };
    }

    private isHomePath(path: string): boolean {
        return path.split('/').length === 1;
    }

    private isThisOrChildPath(childPath: string, parentPath: string) {
        return (
            childPath === parentPath || childPath.startsWith(`${parentPath}/`)
        );
    }
}
