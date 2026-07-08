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
import { AlbumDTO, FileDTO } from '../common/album-file.types';
import { User } from '../common/user.type';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import { EditGuard } from '../auth/edit.guard';
import { GetService } from './get.service';
import { EditService } from './edit.service';
import { EditInDto } from './dto/edit.in.dto';
import { CacheService } from '../cache/cache.service';

@Controller()
export class GalleryController {
    constructor(
        private getService: GetService,
        private editService: EditService,
        private cacheService: CacheService
    ) {}

    @Get(['get', 'get/*path'])
    @SkipAuthGuard()
    async get(
        @Req()
        request: Request & {
            user?: User;
            token?: string;
            accessedPath?: string;
        },
        @Query('date-ranges') dateRanges: string,
        @Param('path') path?: string | undefined
    ): Promise<{
        albums: AlbumDTO[];
        files: FileDTO[];
        user?: User;
    }> {
        const data = await this.getService.get(
            (path || '').replace(/,/g, '/'),
            request.user?.accesses,
            request.user?.isEditAccess,
            request.accessedPath,
            dateRanges?.split(',').map((dateRange) => dateRange.split('-'))
        );

        return {
            ...data,
            user: request.user,
        };
    }

    @Post('edit')
    @UseGuards(EditGuard)
    async edit(@Body() body: EditInDto): Promise<{ success: boolean }> {
        await this.editService.edit(body);

        return { success: true };
    }

    @Post('invalidate-cache')
    @SkipAuthGuard()
    @UseGuards(GoogleAuthGuard)
    async invalidateCache(): Promise<{ success: boolean }> {
        await this.cacheService.invalidate([
            'albums',
            'files',
            'users',
            'storage-file-paths',
        ]);

        return { success: true };
    }
}
