import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { Album, File, FileModel } from '../common/album-file.types';
import { User } from '../common/user.type';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import { EditGuard } from '../auth/edit.guard';
import { GetService } from './get.service';
import { EditService } from './edit.service';
import { UtilsService } from './utils.service';
import { EditInDto } from './dto/edit.in.dto';
import { JwtUpdate } from '../auth/jwt-update.interceptor';

@Controller()
@UseInterceptors(JwtUpdate)
export class GalleryController {
    constructor(
        private getService: GetService,
        private editService: EditService,
        private utilsService: UtilsService
    ) {}

    @Get('get/:mainPath?')
    @Public()
    async get(
        @Req() request: Request & { user?: User; token?: string },
        @Query('home') home: string,
        @Param('mainPath') mainPath: string
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

    @Post('edit')
    @UseGuards(EditGuard)
    async edit(@Body() body: EditInDto): Promise<{ result: string }> {
        await this.editService.edit(body);

        return { result: 'success' };
    }

    // service accounts endpoints

    @Post('edit/update-file-accesses')
    @Public() // to skip AuthGuard
    @UseGuards(GoogleAuthGuard)
    async updateFileAccesses() {
        const { makePublicPaths, makePrivatePaths } =
            await this.utilsService.updateFileAccesses();

        return { success: true, makePublicPaths, makePrivatePaths };
    }

    @Post('edit/update-sources-config')
    @Public() // to skip AuthGuard
    @UseGuards(GoogleAuthGuard)
    async updateSourcesConfig() {
        await this.utilsService.updateSourcesConfig();

        return { success: true };
    }

    @Post('edit/update-sort-albums-files')
    @Public() // to skip AuthGuard
    @UseGuards(GoogleAuthGuard)
    async updateSortAlbumsFiles(@Body() { files }: { files: FileModel[] }) {
        await this.utilsService.sortAndSaveAlbumsAndFiles(files);

        return { success: true };
    }
}
