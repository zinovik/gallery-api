import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { AlbumModel, FileModel } from '../common/album-file.types';
import { sortAlbums, sortFiles } from './helper/sort.helper';

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

        console.log(albumsSorted.length);
    }
}
