import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { hasAccess } from './helper/access.helper';
import { Album, File } from '../common/album-file.types';

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
        albums: Album[];
        files: File[];
    }> {
        const [filesWithoutUrls, albums, sourcesConfig] = await Promise.all([
            this.storageService.getFiles(),
            this.storageService.getAlbums(),
            this.storageService.getSourcesConfig(),
        ]);

        const accessibleFilesWithoutUrls = filesWithoutUrls.filter((file) =>
            hasAccess(userAccesses, file.accesses, file.path, accessedPath)
        );
        const accessibleAlbums = albums.filter((album) =>
            hasAccess(userAccesses, album.accesses, album.path, accessedPath)
        );

        return {
            files: isHomeOnly
                ? []
                : this.filterFilesByPathAndDateRanges({
                      files: accessibleFilesWithoutUrls,
                      path,
                      dateRanges,
                  }).map((file) => ({
                      ...file,
                      url: sourcesConfig[file.filename] || file.filename,
                  })),

            albums: (path || isHomeOnly
                ? accessibleAlbums.filter(
                      (album) =>
                          ((isHomeInclude || isHomeOnly) &&
                              this.isTopLevelPath(album.path)) ||
                          (path && this.isThisOrChildPath(album.path, path))
                  )
                : accessibleAlbums
            ).map((album) => ({
                ...album,
                filesAmount: this.isTopLevelPath(album.path)
                    ? accessibleFilesWithoutUrls.filter((file) =>
                          this.isThisOrChildPath(file.path, album.path)
                      ).length
                    : 0,
            })),
        };
    }

    private isTopLevelPath(path: string): boolean {
        return !path.includes('/');
    }

    private isThisOrChildPath(childPath: string, parentPath: string) {
        return (
            childPath === parentPath || childPath.startsWith(`${parentPath}/`)
        );
    }

    private filterFilesByPathAndDateRanges({
        files,
        path,
        dateRanges,
    }: {
        files: Omit<File, 'url'>[];
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
