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
import { Album, File, FileModel } from '../types';
import { User } from '../common/user';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import { EditGuard } from '../auth/edit.guard';
import { GetService } from './get.service';
import { EditService } from './edit.service';
import { UtilsService } from './utils.service';
import { EditInDto } from './dto/edit.in.dto';

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
        albums: Album[];
        files: File[];
        user?: User;
    }> {
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
        const { makePublicPaths, makePrivatePaths } =
            await this.utilsService.updateFileAccesses();

        return { success: true, makePublicPaths, makePrivatePaths };
    }

    @Public() // to skip AuthGuard and EditGuard
    @UseGuards(GoogleAuthGuard)
    @Post('edit/update-sources-config')
    async updateSourcesConfig(@Req() request: Request & { user?: User }) {
        await this.utilsService.updateSourcesConfig();

        return { success: true };
    }

    @Public() // to skip AuthGuard and EditGuard
    @UseGuards(GoogleAuthGuard)
    @Post('edit/update-sort-albums-files')
    async updateSortAlbumsFiles(@Body() { files }: { files: FileModel[] }) {
        await this.utilsService.sortAndSaveAlbumsAndFiles(files);

        return { success: true };
    }

    @Post('edit')
    @UseGuards(EditGuard)
    async edit(
        @Body()
        body: EditInDto
    ): Promise<{ result: string }> {
        await this.editService.edit(body);

        return { result: 'success' };
    }
}
