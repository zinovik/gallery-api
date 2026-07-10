import { Injectable } from '@nestjs/common';
import { StorageService } from './storage.service';
import { hasAccess } from './helper/access.helper';
import { AlbumDTO, FileDTO, FileModel } from '../common/album-file.types';
import { sortAlbums, sortFiles } from './helper/sort.helper';
import {
    isThisOrChildOrParentPath,
    isThisOrChildPath,
} from './helper/common.helper';

@Injectable()
export class GetService {
    constructor(private readonly storageService: StorageService) {}

    async get(
        path: string,
        userAccesses: string[] = [],
        isEditAccess: boolean | undefined,
        accessedPath: string | undefined,
        dateRanges?: string[][],
        tags?: string[]
    ): Promise<{
        albums: AlbumDTO[];
        files: FileDTO[];
    }> {
        const isHomeOnly = path === '' && !dateRanges;

        // GET RAW

        const [dbFiles, dbAlbums] = await Promise.all([
            this.storageService.getFiles(path, dateRanges, tags),
            this.storageService.getAlbums(path, Boolean(dateRanges)),
        ]);

        // FILTER BY ACCESS

        const accessibleAlbums = dbAlbums.filter((album) =>
            hasAccess(
                userAccesses,
                album.resolved?.accesses ?? album.accesses ?? [],
                album.path,
                accessedPath
            )
        );

        const accessibleFilesWithoutUrls = dbFiles.filter((file) =>
            hasAccess(
                userAccesses,
                file.resolved?.accesses ?? file.accesses ?? [],
                file.resolved?.path ?? file.path ?? 'NOT RESOLVED',
                accessedPath
            )
        );

        // SORT FILES

        const sortedFiles = sortFiles(accessibleFilesWithoutUrls);

        // FILTER BY PATH/DATE

        const filteredFiles = isHomeOnly
            ? []
            : this.filterFilesByPathDateRangesAndTags({
                  files: sortedFiles,
                  path,
                  dateRanges,
                  tags,
              });

        const filteredAlbums =
            path || isHomeOnly
                ? accessibleAlbums.filter(
                      (album) =>
                          (isHomeOnly && this.isRootPath(album.path)) ||
                          (path && isThisOrChildOrParentPath(album.path, path))
                  )
                : accessibleAlbums;

        // GET SIGNED URLS

        console.time('getSignedUrlsMap');
        const signedUrlsMap = await this.storageService.getSignedUrlsMap(
            filteredFiles.map((file) => [
                file.filename,
                file.resolved?.storagePath,
            ])
        );
        console.timeEnd('getSignedUrlsMap');

        // CALCULATE FILE AMOUNTS AND STRIP EDIT-RELATED FIELDS

        const filesAmountsMap = this.getFilesAmountMap(
            accessibleFilesWithoutUrls
        );

        const albums = filteredAlbums.map((album) => {
            const filesAmount = filesAmountsMap.get(album.path) ?? 0;

            return {
                ...album,
                ...(filesAmount > 0 ? { filesAmount: filesAmount } : {}),
                ...(isEditAccess
                    ? {}
                    : {
                          title:
                              album.resolved?.title ??
                              album.title ??
                              'NOT RESOLVED',
                          accesses: undefined,
                          defaultAccesses: undefined,
                          resolved: undefined,
                      }),
            };
        });

        // ADD SIGNED URLS AND STRIP EDIT-RELATED FIELDS, SORT ALBUMS AND RETURN

        return {
            files: filteredFiles.map((file) => ({
                ...file,
                url: signedUrlsMap.get(file.filename) || '',
                ...(isEditAccess
                    ? {
                          resolved: {
                              ...file.resolved,
                              storagePath: undefined,
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

            albums: sortAlbums(albums, sortedFiles),
        };
    }

    private isRootPath(path: string): boolean {
        return !path.includes('/');
    }

    private filterFilesByPathDateRangesAndTags({
        files,
        path,
        dateRanges,
        tags,
    }: {
        files: FileModel[];
        path: string;
        dateRanges?: string[][];
        tags?: string[];
    }) {
        if (!path && !dateRanges && !tags) return files;

        return files.filter((file) => {
            const filePath = file.resolved?.path ?? file.path ?? 'NOT RESOLVED';

            if (path && !isThisOrChildPath(filePath, path)) return false;

            const datetime = this.getDatetimeFromFilename(file.filename);

            if (
                dateRanges &&
                !dateRanges.some(
                    ([from, to]) =>
                        (!from || datetime.slice(0, from.length) >= from) &&
                        (!to || datetime.slice(0, to.length) <= to)
                )
            ) {
                return false;
            }

            if (tags && !tags.some((tag) => file.tags?.includes(tag))) {
                return false;
            }

            return true;
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

    private getFilesAmountMap(
        files: { path?: string; resolved?: { path?: string } }[]
    ): Map<string, number> {
        const filesAmountsMap = new Map<string, number>();

        files.forEach((file) => {
            const filePath = file.resolved?.path ?? file.path ?? 'NOT RESOLVED';
            const rootPath = filePath.split('/')[0];

            filesAmountsMap.set(
                rootPath,
                (filesAmountsMap.get(rootPath) ?? 0) + 1
            );
        });

        return filesAmountsMap;
    }
}
