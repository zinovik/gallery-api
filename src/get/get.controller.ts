import { Controller, Get, Req } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { Public } from '../common/public';
import {
    BUCKET_NAME,
    FILES_FILE_NAME,
    ALBUMS_FILE_NAME,
    SOURCES_CONFIG_FILE_NAME,
    ACCESS_ALL,
    ACCESS_ANY,
} from '../config';
import { AlbumDTO, AlbumModel, FileDTO, FileModel } from '../types';

@Controller('get')
export class GetController {
    constructor(private readonly storageService: StorageService) {}

    @Public()
    @Get('')
    async get(
        @Req()
        request: Request & { user?: { accesses: string[]; email: string } }
    ): Promise<{
        albums: AlbumDTO[];
        files: FileDTO[];
        email?: string;
    }> {
        const [allAlbums, allFilesWithoutUrls, sourcesConfig] =
            (await Promise.all([
                this.storageService.getFile(BUCKET_NAME, ALBUMS_FILE_NAME),
                this.storageService.getFile(BUCKET_NAME, FILES_FILE_NAME),
                this.storageService.getFile(
                    BUCKET_NAME,
                    SOURCES_CONFIG_FILE_NAME
                ),
            ])) as [AlbumModel[], FileModel[], Record<string, string>];

        const allAlbumAccesses = [
            ...allAlbums.filter(
                (album) => album.accesses && album.accesses.length > 0
            ),
        ]
            .sort(
                (a1, a2) =>
                    a2.path.split('/').length - a1.path.split('/').length
            )
            .map((album) => ({
                path: album.path,
                accesses: album.accesses,
            }));

        const userAccesses = request.user?.accesses || [];

        const albums = allAlbums.filter((album) =>
            this.hasAccess(
                userAccesses,
                album.accesses ||
                    allAlbumAccesses.find((albumAccess) =>
                        albumAccess.path.includes(album.path.split('/')[0])
                    )?.accesses
            )
        );

        const files = allFilesWithoutUrls
            .filter((file) =>
                this.hasAccess(
                    userAccesses,
                    file.accesses ||
                        allAlbumAccesses.find((albumAccess) =>
                            albumAccess.path.includes(file.path.split('/')[0])
                        )?.accesses
                )
            )
            .map((file) => ({
                ...file,
                url: sourcesConfig[file.filename] || file.filename,
            }));

        return {
            files,
            albums,
            email: request.user?.email,
        };
    }

    private hasAccess(
        userAccesses: string[],
        requiredAccesses = [] as string[]
    ): boolean {
        return (
            userAccesses.includes(ACCESS_ALL) ||
            requiredAccesses.includes(ACCESS_ANY) ||
            requiredAccesses.some((access) => userAccesses.includes(access))
        );
    }
}
