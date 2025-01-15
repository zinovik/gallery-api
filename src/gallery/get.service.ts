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
        const [albums, filesWithoutUrls, sourcesConfig] = await Promise.all([
            this.storageService.getAlbums(),
            this.storageService.getFiles(),
            this.storageService.getSourcesConfig(),
        ]);

        const accessibleAlbums = albums.filter((album) =>
            hasAccess(userAccesses, album.accesses, album.path, accessedPath)
        );

        const accessibleFiles = filesWithoutUrls
            .filter((file) =>
                hasAccess(userAccesses, file.accesses, file.path, accessedPath)
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
                          (isHomeInclude && this.isRootPath(album.path)) ||
                          (mainPath && album.path.split('/')[0] === mainPath)
                  )
                : accessibleAlbums
            )
                .map((album) => ({
                    ...album,
                    filesTemp: accessibleFiles.filter((file) =>
                        this.isThisOrChildPath(file.path, album.path)
                    ),
                }))
                .sort((album1, album2) => {
                    if (album1.path.includes('/') || album2.path.includes('/'))
                        return 0;

                    const lastFileAlbum1 =
                        album1.filesTemp.slice(-1)[0].filename;
                    const lastFileAlbum2 =
                        album2.filesTemp.slice(-1)[0].filename;

                    return lastFileAlbum1.localeCompare(lastFileAlbum2);
                })
                .map((album) => {
                    const { filesTemp, ...albumRest } = album;

                    return {
                        ...albumRest,
                        filesAmount: album.filesTemp.length,
                    };
                }),
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
