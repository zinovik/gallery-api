import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import {
    AddedAlbum,
    RemovedAlbum,
    RemovedFile,
    UpdatedAlbum,
    UpdatedFile,
} from '../common/album-file.types';

@Injectable()
export class EditService {
    constructor(private readonly storageService: StorageService) {}

    async edit(body: {
        remove?: {
            albums?: RemovedAlbum[];
            files?: RemovedFile[];
        };
        add?: {
            albums?: AddedAlbum[];
        };
        update?: {
            albums?: UpdatedAlbum[];
            files?: UpdatedFile[];
        };
    }): Promise<void> {
        await Promise.all([
            this.storageService.removeFiles(
                body.remove?.files?.map((f) => f.filename)
            ),
            this.storageService.updateFiles(body.update?.files),
            this.storageService.removeAlbums(
                body.remove?.albums?.map((a) => a.path)
            ),
            this.storageService.updateAlbums(body.update?.albums),
            this.storageService.addAlbums(body.add?.albums),
        ]);
    }
}
