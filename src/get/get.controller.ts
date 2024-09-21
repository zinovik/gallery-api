import { Controller, Get, Req } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { Public } from '../common/public';
import { AlbumDTO, FileDTO } from '../types';
import { User } from '../common/user';
import { getAlbumAccessesSorted, hasAccess } from '../helper/access';

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
        console.log(`gallery user email: ${request.user?.email}`);

        const [albums, filesWithoutUrls, sourcesConfig] = await Promise.all([
            this.storageService.getAlbums(),
            this.storageService.getFiles(),
            this.storageService.getSourcesConfig(),
        ]);

        const albumAccessesSorted = getAlbumAccessesSorted(albums);

        const userAccesses = request.user?.accesses || [];

        const filteredAlbums = albums.filter((album) =>
            hasAccess(
                userAccesses,
                album.accesses,
                album.path,
                albumAccessesSorted
            )
        );

        const filteredFiles = filesWithoutUrls
            .filter((file) =>
                hasAccess(
                    userAccesses,
                    file.accesses,
                    file.path,
                    albumAccessesSorted
                )
            )
            .map((file) => ({
                ...file,
                url: sourcesConfig[file.filename] || file.filename,
            }));

        return {
            files: filteredFiles,
            albums: filteredAlbums,
            user: request.user,
        };
    }
}
