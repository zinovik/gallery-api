import { Controller, Get, Req } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { Public } from '../common/public';
import {
    BUCKET_NAME,
    FILES_FILE_NAME,
    ALBUMS_FILE_NAME,
    SOURCES_CONFIG_FILE_NAME,
} from '../config';
import { AlbumDTO, AlbumModel, FileDTO, FileModel } from '../types';

@Controller('get')
export class GetController {
    constructor(private readonly storageService: StorageService) {}

    @Public()
    @Get('')
    async get(@Req() request: Request & { user?: { email: string } }): Promise<{
        albums: AlbumDTO[];
        files: FileDTO[];
    }> {
        const [albums, filesWithoutUrls, sourcesConfig] = (await Promise.all([
            this.storageService.getFile(BUCKET_NAME, ALBUMS_FILE_NAME),
            this.storageService.getFile(BUCKET_NAME, FILES_FILE_NAME),
            this.storageService.getFile(BUCKET_NAME, SOURCES_CONFIG_FILE_NAME),
        ])) as [AlbumModel[], FileModel[], Record<string, string>];

        const user = request.user?.email;
        console.log(user);

        const files = filesWithoutUrls
            .filter((file) => file) // TBA
            .map((file) => ({
                ...file,
                url: sourcesConfig[file.filename] || file.filename,
            }));

        return {
            files,
            albums,
        };
    }
}
