import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import {
    AddedAlbum,
    AddedFile,
    RemovedAlbum,
    RemovedFile,
    UpdatedAlbum,
    UpdatedFile,
} from '../common/album-file.types';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class EditService {
    constructor(
        private readonly storageService: StorageService,
        private readonly cacheService: CacheService
    ) {}

    async edit(body: {
        remove?: {
            albums?: RemovedAlbum[];
            files?: RemovedFile[];
        };
        add?: {
            albums?: AddedAlbum[];
            files?: AddedFile[];
        };
        update?: {
            albums?: UpdatedAlbum[];
            files?: UpdatedFile[];
        };
    }): Promise<void> {
        await this.storageService.removeFiles(
            body.remove?.files?.map((f) => f.filename)
        );

        await this.storageService.updateFiles(body.update?.files);

        await this.storageService.addFiles(body.add?.files);

        await this.storageService.removeAlbums(
            body.remove?.albums?.map((a) => a.path)
        );

        await this.storageService.updateAlbums(body.update?.albums);

        await this.storageService.addAlbums(body.add?.albums);

        await this.cacheService.invalidateAll(true);
    }
}
