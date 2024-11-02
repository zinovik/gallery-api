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
import { Public } from '../common/public';
import {
    AddedAlbumDTO,
    AlbumDTO,
    FileDTO,
    FileModel,
    RemovedAlbumDTO,
    RemovedFileDTO,
    UpdatedAlbumDTO,
    UpdatedFileDTO,
} from '../types';
import { User } from '../common/user';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import { EditGuard } from '../auth/edit.guard';
import { GetService } from './get.service';
import { EditService } from './edit.service';
import { UtilsService } from './utils.service';

@Controller()
export class MainController {
    constructor(
        private getService: GetService,
        private editService: EditService,
        private utilsService: UtilsService
    ) {}

    @Public()
    @Get('get/:mainPath?')
    async get(
        @Req() request: Request & { user?: User },
        @Query() { home }: { home: string },
        @Param() { mainPath }: { mainPath: string }
    ): Promise<{
        albums: AlbumDTO[];
        files: FileDTO[];
        user?: User;
    }> {
        console.log(`gallery user email: ${request.user?.email}`);

        const userAccesses = request.user?.accesses || [];

        return {
            ...(await this.getService.get(
                mainPath,
                userAccesses,
                home === 'only',
                home === 'include' || home === 'only'
            )),
            user: request.user,
        };
    }

    @Public() // to skip AuthGuard and EditGuard
    @UseGuards(GoogleAuthGuard)
    @Post('edit/update-file-accesses')
    async updateFileAccesses(@Req() request: Request & { user?: User }) {
        console.log(
            `service-account email (update-file-accesses): ${request.user?.email}`
        );

        const { makePublicPaths, makePrivatePaths } =
            await this.utilsService.updateFileAccesses();

        return { success: true, makePublicPaths, makePrivatePaths };
    }

    @Public() // to skip AuthGuard and EditGuard
    @UseGuards(GoogleAuthGuard)
    @Post('edit/update-sources-config')
    async updateSourcesConfig(@Req() request: Request & { user?: User }) {
        console.log(
            `service-account email (update-sources-config): ${request.user?.email}`
        );

        await this.utilsService.updateSourcesConfig();

        return { success: true };
    }

    @Public() // to skip AuthGuard and EditGuard
    @UseGuards(GoogleAuthGuard)
    @Post('edit/update-sort-albums-files')
    async updateSortAlbumsFiles(
        @Req() request: Request & { user?: User },
        @Body() { files }: { files: FileModel[] }
    ) {
        console.log(
            `service-account email (update-sort-albums-files): ${request.user?.email}`
        );

        await this.utilsService.sortAndSaveAlbumsAndFiles(files);

        return { success: true };
    }

    @Post('edit')
    @UseGuards(EditGuard)
    async edit(
        @Body()
        body: {
            remove?: {
                albums?: RemovedAlbumDTO[];
                files?: RemovedFileDTO[];
            };
            add?: {
                albums?: AddedAlbumDTO[];
            };
            update?: {
                albums?: UpdatedAlbumDTO[];
                files?: UpdatedFileDTO[];
            };
        }
    ): Promise<{ result: string }> {
        console.log(JSON.stringify(body));

        await this.editService.edit(body);

        return { result: 'success' };
    }
}
