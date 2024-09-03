import { Controller, Get } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { Public } from '../common/public';

const BUCKET_NAME = 'zinovik-gallery';
const FILES_FILE_NAME = 'files.json';
const ALBUMS_FILE_NAME = 'albums.json';
const SOURCES_CONFIG_FILE_NAME = 'sources-config.json';

interface AlbumInterface {
    path: string;
    title: string;
    text?: string | string[];
    isSorted?: true;
}

interface FileInterface {
    path: string;
    filename: string;
    isTitle?: true;
    isNoThumbnail?: true;
    description: string;
    text?: string | string[];
    isVertical?: true;
}

@Controller('get')
export class GetController {
    constructor(private readonly storageService: StorageService) {}

    @Public()
    @Get('files')
    async files(): Promise<FileInterface[]> {
        const files = await this.storageService.getFile(
            BUCKET_NAME,
            FILES_FILE_NAME
        );

        return files as FileInterface[];
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

    @Public()
    @Get('sources-config')
    async sourcesConfig(): Promise<Record<string, string>> {
        const sourcesConfig = await this.storageService.getFile(
            BUCKET_NAME,
            SOURCES_CONFIG_FILE_NAME
        );

        return sourcesConfig as Record<string, string>;
    }
}
