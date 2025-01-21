import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { hasAccess } from './helper/access.helper';
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
        const [filesWithoutUrls, albums, sourcesConfig] = await Promise.all([
            this.storageService.getFiles(),
            this.storageService.getAlbums(),
            this.storageService.getSourcesConfig(),
        ]);

        const accessibleFiles = filesWithoutUrls
            .filter((file) =>
                hasAccess(userAccesses, file.accesses, file.path, accessedPath)
            )
            .map((file) => ({
                ...file,
                url: sourcesConfig[file.filename] || file.filename,
            }));

        const accessibleAlbums = albums.filter((album) =>
            hasAccess(userAccesses, album.accesses, album.path, accessedPath)
        );

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
                          (isHomeInclude && this.isRootPath(album.path)) ||
                          (mainPath && album.path.split('/')[0] === mainPath)
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

    private isRootPath(path: string): boolean {
        return !path.includes('/');
    }

    private isThisOrChildPath(childPath: string, parentPath: string) {
        return (
            childPath === parentPath || childPath.startsWith(`${parentPath}/`)
        );
    }
}
