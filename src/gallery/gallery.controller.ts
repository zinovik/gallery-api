import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { SkipAuthGuard } from '../common/skip-auth-guard.decorator';
import { AlbumDTO, FileDTO, TokenAccess } from '../common/album-file.types';
import { User } from '../common/user.type';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import { EditGuard } from '../auth/edit.guard';
import { GetService } from './get.service';
import { EditInDto } from './dto/edit.in.dto';
import { CacheService } from '../cache/cache.service';
import { StorageService } from './storage.service';

@Controller()
export class GalleryController {
    constructor(
        private readonly getService: GetService,
        private readonly storageService: StorageService,
        private readonly cacheService: CacheService
    ) {}

    @Get(['get', 'get/*path'])
    @SkipAuthGuard()
    async get(
        @Req()
        request: Request & {
            user?: User;
            token?: string;
            tokenAccess?: TokenAccess;
        },
        @Query('date-ranges') dateRanges: string,
        @Query('tags') tags: string,
        @Param('path') path?: string | undefined
    ): Promise<{
        albums: AlbumDTO[];
        files: FileDTO[];
        user?: User;
    }> {
        if (!request.user) {
            return { albums: [], files: [] };
        }

        const data = await this.getService.get(
            (path || '').replace(/,/g, '/'),
            request.user?.accesses,
            request.user?.isEditAccess,
            request.tokenAccess,
            dateRanges?.split(',').map((dateRange) => dateRange.split('-')),
            tags?.split(',')
        );

        return {
            ...data,
            user: request.user,
        };
    }

    @Post('edit')
    @UseGuards(EditGuard)
    async edit(@Body() body: EditInDto): Promise<{ success: boolean }> {
        await this.storageService.removeFiles(body.remove?.files);
        await this.storageService.updateFiles(body.update?.files);
        await this.storageService.removeAlbums(body.remove?.albums);
        await this.storageService.updateAlbums(body.update?.albums);
        await this.storageService.addAlbums(body.add?.albums);

        await this.cacheService.invalidate(['albums:', 'files:'], true);

        return { success: true };
    }

    @Post('resolve')
    @UseGuards(EditGuard)
    async resolve(): Promise<{ success: boolean }> {
        await this.storageService.resolve();

        await this.cacheService.invalidate(['albums:', 'files:'], true);

        return { success: true };
    }

    @Post('resolve-new-storage-files')
    @SkipAuthGuard()
    @UseGuards(GoogleAuthGuard)
    async resolveNewStorageFiles(): Promise<{ success: boolean }> {
        await this.storageService.resolve(true);

        await this.cacheService.invalidate([
            'albums:',
            'files:',
            'all-users',
            'storage-file-paths',
        ]);

        return { success: true };
    }
}
