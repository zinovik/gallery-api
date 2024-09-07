import { Controller, Get, Req } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { Public } from '../common/public';
import {
    BUCKET_NAME,
    FILES_FILE_NAME,
    ALBUMS_FILE_NAME,
    SOURCES_CONFIG_FILE_NAME,
} from '../config';
import { AlbumInterface, FileInterface } from '../types';

@Controller('get')
export class GetController {
    constructor(private readonly storageService: StorageService) {}

    @Public()
    @Get('files')
    async files(
        @Req() request: Request & { user?: { email: string } }
    ): Promise<FileInterface[]> {
        const [files, sourcesConfig] = (await Promise.all([
            this.storageService.getFile(BUCKET_NAME, FILES_FILE_NAME),
            this.storageService.getFile(BUCKET_NAME, SOURCES_CONFIG_FILE_NAME),
        ])) as [FileInterface[], Record<string, string>];

        const user = request.user?.email;
        console.log(user);

        const filesWithUrls = files
            .filter((file) => file) // TBA
            .map((file) => ({
                ...file,
                url: sourcesConfig[file.filename] || file.filename,
            }));

        return filesWithUrls as FileInterface[];
    }

    @Public()
    @Get('albums')
    async albums(): Promise<AlbumInterface[]> {
        const albums = await this.storageService.getFile(
            BUCKET_NAME,
            ALBUMS_FILE_NAME
        );

        return albums as AlbumInterface[];
    }
}
