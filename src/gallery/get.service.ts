import { Injectable } from '@nestjs/common';
import { StorageService } from './storage.service';
import { hasAccess, resolveAccesses } from './helper/access.helper';
import {
    AlbumDTO,
    AlbumModel,
    FileDTO,
    FileModel,
} from '../common/album-file.types';
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
        dateRanges?: string[][]
    ): Promise<{
        albums: AlbumDTO[];
        files: FileDTO[];
    }> {
        const isHomeOnly = path === '' && !dateRanges;

        // GET RAW

        const [storageFilePaths, dbFiles, dbAlbums] = await Promise.all([
            this.storageService.getStorageFilePaths(),
            this.storageService.getFiles(path, dateRanges),
            this.storageService.getAlbums(path, Boolean(dateRanges)),
        ]);

        // POPULATE AND SORT

        console.time('populateFiles');
        const populatedFiles = this.populateFiles(storageFilePaths, dbFiles);
        console.timeEnd('populateFiles');

        const filePaths: string[] = [
            ...new Set(populatedFiles.map((file) => file.path)),
        ];

        console.time('populateAlbums');
        const populatedAlbums = this.populateAlbums(filePaths, dbAlbums);
        console.timeEnd('populateAlbums');

        // RESOLVE ACCESS

        const albumsMap = new Map(
            populatedAlbums.map((album) => [album.path, album])
        );
        const albumsWithResolvedAccesses = populatedAlbums.map((album) => ({
            ...album,
            resolvedAccesses: resolveAccesses(
                album.accesses,
                album.path,
                albumsMap
            ),
        }));

        const filesWithResolvedAccesses = populatedFiles.map((file) => ({
            ...file,
            resolvedAccesses: resolveAccesses(
                file.accesses,
                file.path,
                albumsMap
            ),
        }));

        // FILTER BY ACCESS

        const accessibleAlbums = albumsWithResolvedAccesses.filter((album) =>
            hasAccess(
                userAccesses,
                album.resolvedAccesses,
                album.path,
                accessedPath
            )
        );

        const accessibleFilesWithoutUrls = filesWithResolvedAccesses.filter(
            (file) =>
                hasAccess(
                    userAccesses,
                    file.resolvedAccesses,
                    file.path,
                    accessedPath
                )
        );

        // SORT FILES

        const sortedFiles = sortFiles(accessibleFilesWithoutUrls);

        // FILTER BY PATH/DATE

        const filteredFiles = isHomeOnly
            ? []
            : this.filterFilesByPathAndDateRanges({
                  files: sortedFiles,
                  path,
                  dateRanges,
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
            filteredFiles.map((file) => file.filename)
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
                          accesses: undefined,
                          resolvedAccesses: undefined,
                          defaultAccesses: undefined,
                          isDb: undefined,
                      }),
            };
        });

        // ADD SIGNED URLS AND STRIP EDIT-RELATED FIELDS, SORT ALBUMS AND RETURN

        return {
            files: filteredFiles.map((file) => ({
                ...file,
                url: signedUrlsMap.get(file.filename) || '',
                ...(isEditAccess
                    ? {}
                    : {
                          accesses: undefined,
                          resolvedAccesses: undefined,
                          isDb: undefined,
                      }),
            })),

            albums: sortAlbums(albums, sortedFiles),
        };
    }

    private populateFiles(
        storageFilePaths: string[],
        filesWithoutUrls: FileModel[]
    ): (FileModel & { path: string; isDb?: true })[] {
        const DATE_PREFIX_REGEX = /(?:^|\/)\d{4}\.\d{2}\.\d{2} - /;
        const CLEAN_CHARS_REGEX = /[().,]/g;
        const WHITESPACE_REGEX = /[\s']+/g;
        const DASHES_REGEX = /-+/g;

        const filesWithoutUrlsMap = new Map<string, FileModel>();
        for (const file of filesWithoutUrls) {
            filesWithoutUrlsMap.set(file.filename, file);
        }

        const result: (FileModel & { path: string; isDb?: true })[] = [];

        for (const storageFilePath of storageFilePaths) {
            const lastSlash = storageFilePath.lastIndexOf('/');
            const filename =
                lastSlash >= 0
                    ? storageFilePath.slice(lastSlash + 1)
                    : storageFilePath;

            const file = filesWithoutUrlsMap.get(filename);

            let path: string;

            if (file?.path) {
                path = file.path;
            } else {
                const dir =
                    lastSlash >= 0 ? storageFilePath.slice(0, lastSlash) : '';

                path = dir
                    .replace(DATE_PREFIX_REGEX, '')
                    .trim()
                    .replace(CLEAN_CHARS_REGEX, '')
                    .replace(WHITESPACE_REGEX, '-')
                    .replace(DASHES_REGEX, '-')
                    .toLowerCase();
            }

            result.push({
                ...(file ? { ...file, isDb: true } : {}),
                filename,
                path,
            });
        }

        return result;
    }

    private populateAlbums(
        filePaths: string[],
        albums: AlbumModel[]
    ): (AlbumModel & { title: string; isDb?: true })[] {
        const albumsMap = new Map<string, AlbumModel>();
        albums.forEach((album) => albumsMap.set(album.path, album));

        const populatedAlbums: (AlbumModel & { title: string; isDb?: true })[] =
            [];
        const usedAlbums: Set<string> = new Set();

        filePaths.forEach((filePath) => {
            const album = albumsMap.get(filePath);

            if (album) usedAlbums.add(album.path);

            populatedAlbums.push({
                ...(album ? { ...album, isDb: true } : {}),
                path: filePath,
                title:
                    (album?.title ??
                        filePath
                            .split('/')
                            .slice(-1)[0]
                            .replace(/-/g, ' ')
                            .replace(/\b\w/g, (c) => c.toUpperCase())) ||
                    'untitled',
            });
        });

        albums.forEach((album) => {
            if (!usedAlbums.has(album.path)) {
                populatedAlbums.push({
                    ...album,
                    title:
                        album.title ??
                        (album.path.split('/').pop() ?? '')
                            .replace(/-/g, ' ')
                            .replace(/\b\w/g, (c) => c.toUpperCase()),
                    isDb: true,
                });
            }
        });

        return populatedAlbums;
    }

    private isRootPath(path: string): boolean {
        return !path.includes('/');
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
            if (path && !isThisOrChildPath(file.path, path)) return false;

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

    private getFilesAmountMap(files: { path: string }[]): Map<string, number> {
        const filesAmountsMap = new Map<string, number>();

        files.forEach((file) => {
            const rootPath = file.path.split('/')[0];

            filesAmountsMap.set(
                rootPath,
                (filesAmountsMap.get(rootPath) ?? 0) + 1
            );
        });

        return filesAmountsMap;
    }
}
