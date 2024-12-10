import { Module } from '@nestjs/common';
import { GalleryController } from './gallery.controller';
import { StorageService } from '../storage/storage.service';
import { AuthModule } from '../auth/auth.module';
import { GetService } from './get.service';
import { EditService } from './edit.service';
import { UtilsService } from './utils.service';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [ConfigModule, AuthModule],
    controllers: [GalleryController],
    providers: [StorageService, GetService, EditService, UtilsService],
})
export class GalleryModule {}
