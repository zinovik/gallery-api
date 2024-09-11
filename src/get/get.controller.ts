import { Controller, Get, Req } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { Public } from '../common/public';
import { ACCESS_ALL, ACCESS_ANY } from '../config';
import { AlbumDTO, FileDTO } from '../types';
import { User } from '../common/user';

@Controller('get')
export class GetController {
    constructor(private readonly storageService: StorageService) {}

    @Public()
    @Get('')
    async get(
        @Req()
        request: Request & { user?: User }
    ): Promise<{
        albums: AlbumDTO[];
        files: FileDTO[];
        user?: User;
    }> {
        const [allAlbums, allFilesWithoutUrls, sourcesConfig] =
            await Promise.all([
                this.storageService.getAlbums(),
                this.storageService.getFiles(),
                this.storageService.getSourcesConfig(),
            ]);

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
            user: request.user,
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
