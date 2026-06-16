import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { AlbumModel, FileModel } from '../common/album-file.types';
import { sortAlbums, sortFiles } from './helper/sort.helper';
import { getPublicFilenames } from './helper/access.helper';
import { performBatch } from './helper/batch.helper';

const URL_BATCH_SIZE = 100;
const ACCESS_BATCH_SIZE = 200;
const PUBLIC_URL = 'https://storage.googleapis.com/zinovik-gallery';

@Injectable()
export class UtilsService {
    constructor(private readonly storageService: StorageService) {}

    async sortAndSaveAlbumsAndFiles(
        files: FileModel[],
        albumsArg?: AlbumModel[]
    ): Promise<void> {
        const albums = albumsArg || (await this.storageService.getAlbums());

        const filesSorted = sortFiles(files);
        const albumsSorted = sortAlbums(albums, filesSorted);

        await this.storageService.saveAlbums(albumsSorted);
        await this.storageService.saveFiles(filesSorted);
    }
}
