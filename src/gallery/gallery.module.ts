import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GalleryController } from './gallery.controller';
import { StorageService } from '../storage/storage.service';
import { CacheService } from '../cache/cache.service';
import { FirestoreService } from '../firestore/firestore.service';
import { AuthModule } from '../auth/auth.module';
import { GetService } from './get.service';
import { EditService } from './edit.service';

@Module({
    imports: [ConfigModule, AuthModule],
    controllers: [GalleryController],
    providers: [
        GetService,
        EditService,
        StorageService,
        CacheService,
        FirestoreService,
    ],
})
export class GalleryModule {}
