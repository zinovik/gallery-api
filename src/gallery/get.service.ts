import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { hasAccess } from './helper/access.helper';
import { AlbumDTO, FileDTO } from '../common/album-file.types';
import { sortAlbums } from './helper/sort.helper';

// will be moved to db
const PATH_MAPPINGS: Record<string, string> = {
    'board-games-pure-games': 'board-games',
    'unguja-zanzibar-tanzania': 'zanzibar',
    'warszawska-dycha-payed': 'warszawska-dycha',
    'belarusian-cup-final':
        'football/belarus/belarusian-cup-2017-2018/final-bate-dynamo-brest',
};

@Injectable()
export class GetService {
    constructor(private readonly storageService: StorageService) {}

    async get(
        path: string,
        userAccesses: string[],
        accessedPath: string,
        isHomeOnly: boolean,
        isHomeInclude: boolean,
        dateRanges?: string[][]
    ): Promise<{
        albums: AlbumDTO[];
        files: FileDTO[];
    }> {
        const [storageFilePaths, filesWithoutUrls, albums] = await Promise.all([
            this.storageService.getFilePaths(),
            this.storageService.getFiles(),
            this.storageService.getAlbums(),
        ]);

        const allFiles = this.getPopulatedFilesWithoutUrls(
            storageFilePaths,
            filesWithoutUrls
        );

        const filePaths: string[] = [
            ...new Set(allFiles.map((file) => file.path)),
        ];

        const allAlbums = sortAlbums(
            this.getPopulatedAlbums(filePaths, albums),
            allFiles
        );

        const accessibleFilesWithoutUrls = allFiles.filter((file) =>
            hasAccess(userAccesses, file.accesses, file.path, accessedPath)
        );
        const accessibleAlbums = allAlbums.filter((album) =>
            hasAccess(userAccesses, album.accesses, album.path, accessedPath)
        );

        const filteredFiles = isHomeOnly
            ? []
            : this.filterFilesByPathAndDateRanges({
                  files: accessibleFilesWithoutUrls,
                  path,
                  dateRanges,
              });

        const sourcesConfig =
            await this.storageService.getSourcesConfig(filteredFiles);

        return {
            files: filteredFiles.map((file) => ({
                ...file,
                url: sourcesConfig[file.filename] || '',
            })),

            albums: (path || isHomeOnly
                ? accessibleAlbums.filter(
                      (album) =>
                          ((isHomeInclude || isHomeOnly) &&
                              this.isTopLevelPath(album.path)) ||
                          (path &&
                              this.isThisOrChildOrParentPath(album.path, path))
                  )
                : accessibleAlbums
            ).map((album) => ({
                ...album,
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

    private getPopulatedFilesWithoutUrls(
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
                path: PATH_MAPPINGS[path] ?? path,
                description: file?.description,
                text: file?.text,
                accesses: file?.accesses,
            };
        });
    }

    private getPopulatedAlbums(
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
