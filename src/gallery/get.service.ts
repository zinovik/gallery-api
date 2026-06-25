import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { hasAccess, resolveAccesses } from './helper/access.helper';
import { AlbumDTO, FileDTO } from '../common/album-file.types';
import { sortAlbums, sortFiles } from './helper/sort.helper';

@Injectable()
export class GetService {
    constructor(private readonly storageService: StorageService) {}

    async get(
        path: string,
        userAccesses: string[] = [],
        isEditAccess: boolean | undefined,
        accessedPath: string | undefined,
        isHomeOnly: boolean,
        isHomeInclude: boolean,
        dateRanges?: string[][]
    ): Promise<{
        albums: AlbumDTO[];
        files: FileDTO[];
    }> {
        const [storageFilePaths, dbFiles, dbAlbums] = await Promise.all([
            this.storageService.getStorageFilePaths(),
            this.storageService.getFiles(),
            this.storageService.getAlbums(),
        ]);

        console.time('populateFiles + sortFiles');
        const populatedFiles = sortFiles(
            this.populateFiles(storageFilePaths, dbFiles)
        );
        console.timeEnd('populateFiles + sortFiles');

        const albumsWithAccesses = dbAlbums.map((album) => ({
            ...album,
            resolvedAccesses: resolveAccesses(
                album.accesses,
                album.path,
                dbAlbums
            ),
        }));

        const filesWithAccesses = populatedFiles.map((file) => ({
            ...file,
            resolvedAccesses: resolveAccesses(
                file.accesses,
                file.path,
                dbAlbums
            ),
        }));

        const accessibleAlbums = albumsWithAccesses.filter((album) =>
            hasAccess(
                userAccesses,
                album.resolvedAccesses,
                album.path,
                accessedPath
            )
        );

        const accessibleFilesWithoutUrls = filesWithAccesses.filter((file) =>
            hasAccess(
                userAccesses,
                file.resolvedAccesses,
                file.path,
                accessedPath
            )
        );

        const filePaths: string[] = [
            ...new Set(accessibleFilesWithoutUrls.map((file) => file.path)),
        ];

        console.time('populateAlbums + sortAlbums');
        const populatedAlbums = sortAlbums(
            this.populateAlbums(filePaths, accessibleAlbums),
            accessibleFilesWithoutUrls
        );
        console.timeEnd('populateAlbums + sortAlbums');

        const filteredFiles = isHomeOnly
            ? []
            : this.filterFilesByPathAndDateRanges({
                  files: accessibleFilesWithoutUrls,
                  path,
                  dateRanges,
              });

        console.time('getSignedUrlsMap');
        const signedUrlsMap = await this.storageService.getSignedUrlsMap(
            filteredFiles.map((file) => file.filename)
        );
        console.timeEnd('getSignedUrlsMap');

        return {
            files: filteredFiles.map((file) => ({
                ...file,
                url: signedUrlsMap[file.filename] || '',
            })),

            albums: (path || isHomeOnly
                ? populatedAlbums.filter(
                      (album) =>
                          ((isHomeInclude || isHomeOnly) &&
                              this.isTopLevelPath(album.path)) ||
                          (path &&
                              this.isThisOrChildOrParentPath(album.path, path))
                  )
                : populatedAlbums
            ).map((album) => ({
                ...album,
                ...(isEditAccess
                    ? {}
                    : {
                          accesses: undefined,
                          resolvedAccesses: undefined,
                      }),
                ...(this.isTopLevelPath(album.path)
                    ? {
                          filesAmount: accessibleFilesWithoutUrls.filter(
                              (file) =>
                                  this.isThisOrChildPath(file.path, album.path)
                          ).length,
                      }
                    : {}),
            })),
        };
    }

    private populateFiles(
        storageFilePaths: string[],
        filesWithoutUrls: Omit<FileDTO, 'url'>[]
    ): Omit<FileDTO, 'url'>[] {
        const filesWithoutUrlsMap: Record<string, Omit<FileDTO, 'url'>> = {};

        filesWithoutUrls.forEach((file) => {
            filesWithoutUrlsMap[file.filename] = file;
        });

        return storageFilePaths.map((storageFilePath) => {
            const filename = storageFilePath.split('/').pop() ?? '';
            const file = filesWithoutUrlsMap[filename];

            const path =
                file?.path ??
                storageFilePath
                    .split('/')
                    .slice(0, -1)
                    .join('/')
                    .replace(/(?:^|\/)\d{4}\.\d{2}\.\d{2} - /, '')
                    .trim()
                    .replace(/[(),]/g, '')
                    .replace(/[\s']+/g, '-')
                    .replace(/-+/g, '-')
                    .toLowerCase();

            return {
                filename,
                path,
                description: file?.description,
                text: file?.text,
                accesses: file?.accesses,
                ...(file ? { isDb: true } : {}),
            };
        });
    }

    private populateAlbums(
        filePaths: string[],
        albums: AlbumDTO[]
    ): AlbumDTO[] {
        const albumsMap: Record<string, AlbumDTO> = {};

        albums.forEach((album) => {
            albumsMap[album.path] = album;
        });

        const populatedAlbums: AlbumDTO[] = [];
        const usedAlbums: Set<string> = new Set();

        filePaths.forEach((filePath) => {
            const album = albumsMap[filePath];

            if (album) usedAlbums.add(album.path);

            populatedAlbums.push({
                path: filePath,
                title:
                    (album?.title ??
                        filePath
                            .split('/')
                            .slice(-1)[0]
                            .replace(/-/g, ' ')
                            .replace(/\b\w/g, (c) => c.toUpperCase())) ||
                    'untitled',
                text: album?.text,
                defaultByDate: album?.defaultByDate,
                order: album?.order,
                accesses: album?.accesses,
                ...(album ? { isDb: true } : {}),
            });
        });

        albums.forEach((album) => {
            if (!usedAlbums.has(album.path)) {
                populatedAlbums.push(album);
            }
        });

        return populatedAlbums;
    }

    private isTopLevelPath(path: string): boolean {
        return !path.includes('/');
    }

    private isThisOrChildPath(currentItemPath: string, requiredPath: string) {
        return (
            currentItemPath === requiredPath ||
            currentItemPath.startsWith(`${requiredPath}/`)
        );
    }

    private isThisOrChildOrParentPath(
        currentItemPath: string,
        requiredPath: string
    ) {
        return (
            currentItemPath === requiredPath ||
            currentItemPath.startsWith(`${requiredPath}/`) ||
            requiredPath.startsWith(`${currentItemPath}/`)
        );
    }

    private filterFilesByPathAndDateRanges({
        files,
        path,
        dateRanges,
    }: {
        files: Omit<FileDTO, 'url'>[];
        path: string;
        dateRanges?: string[][];
    }) {
        if (!path && !dateRanges) return files;

        return files.filter((file) => {
            if (path && !this.isThisOrChildPath(file.path, path)) return false;

            if (!dateRanges) return true;

            const datetime = this.getDatetimeFromFilename(file.filename);

            return dateRanges.some(
                ([from, to]) =>
                    (!from || datetime.slice(0, from.length) >= from) &&
                    (!to || datetime.slice(0, to.length) <= to)
            );
        });
    }

    private getDatetimeFromFilename(filename: string): string {
        const dateTimeParsed = filename.match(
            new RegExp(
                '^([\\d]{4})([\\d]{2})([\\d]{2})_([\\d]{2})([\\d]{2})([\\d]{2})'
            )
        );

        if (!Array.isArray(dateTimeParsed)) {
            const dateParsed = filename.match(
                new RegExp('^([\\d]{4})([\\d]{2})([\\d]{2})')
            );

            if (!Array.isArray(dateParsed)) {
                return '';
            }

            const [, year, month, date] = dateParsed;

            return `${year}${month}${date}`;
        }

        const [, year, month, date, hour, minute, second] = dateTimeParsed;

        return `${year}${month}${date}_${hour}${minute}${second}`;
    }
}
