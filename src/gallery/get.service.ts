import { Injectable } from '@nestjs/common';
import { StorageService } from './storage.service';
import { AlbumDTO, FileDTO, TokenAccess } from '../common/album-file.types';

@Injectable()
export class GetService {
    constructor(private readonly storageService: StorageService) {}

    async get(
        path: string,
        userAccesses: string[] = [],
        isEditAccess: boolean | undefined,
        tokenAccess?: TokenAccess,
        dateRanges?: string[][],
        tags?: string[]
    ): Promise<{
        albums: AlbumDTO[];
        files: FileDTO[];
    }> {
        // GET RAW

        const [dbFiles, dbAlbums] = await Promise.all([
            this.storageService.getFiles(
                path,
                userAccesses,
                dateRanges,
                tags,
                tokenAccess
            ),
            this.storageService.getAlbums(
                path,
                userAccesses,
                Boolean(dateRanges) || Boolean(tags),
                tokenAccess
            ),
        ]);

        // POPULATE ALBUMS (IF NO ACCESS)

        const filePaths = new Set<string>();
        dbFiles.forEach((file) =>
            filePaths.add(file.resolved?.path ?? file.path ?? 'NOT RESOLVED')
        );

        const albumPaths = new Set<string>();
        dbAlbums.forEach((album) => albumPaths.add(album.path));

        for (const filePath of filePaths) {
            if (!albumPaths.has(filePath)) {
                dbAlbums.push({
                    path: filePath,
                    resolved: {
                        title: filePath
                            .split('/')
                            .slice(-1)[0]
                            .replace(/-/g, ' ')
                            .replace(/\b\w/g, (c) => c.toUpperCase()),
                    },
                });
            }
        }

        // GET SIGNED URLS

        console.time('getSignedUrlsMap');
        const signedUrlsMap = await this.storageService.getSignedUrlsMap(
            dbFiles.map((file) => [file.filename, file.resolved?.storagePath])
        );
        console.timeEnd('getSignedUrlsMap');

        // ADD SIGNED URLS, STRIP EDIT-RELATED FIELDS, AND RETURN

        return {
            files: dbFiles.map((file) => ({
                ...file,
                url: signedUrlsMap.get(file.filename) || '',
                ...(isEditAccess
                    ? {
                          resolved: {
                              ...file.resolved,
                              storagePath: undefined,
                              rootPath: undefined,
                              _id: undefined,
                          },
                      }
                    : {
                          path:
                              file.resolved?.path ??
                              file.path ??
                              'NOT RESOLVED',
                          accesses: undefined,
                          resolved: undefined,
                      }),
            })),

            albums: dbAlbums.map((album) =>
                isEditAccess
                    ? {
                          ...album,
                          resolved: {
                              ...album.resolved,
                              _id: undefined as undefined,
                          },
                      }
                    : {
                          ...album,
                          title:
                              album.resolved?.title ??
                              album.title ??
                              'NOT RESOLVED',
                          order: album.resolved?.order ?? album.order,
                          accesses: undefined as undefined,
                          defaultAccesses: undefined as undefined,
                          resolved: undefined as undefined,
                      }
            ),
        };
    }
}
