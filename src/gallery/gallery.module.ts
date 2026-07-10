import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GalleryController } from './gallery.controller';
import { StorageService } from './storage.service';
import { CacheService } from '../cache/cache.service';
import { MongoDbService } from '../mongodb/mongodb.service';
import { AuthModule } from '../auth/auth.module';
import { GetService } from './get.service';
import { MongoDbModule } from '../mongodb/mongodb.module';

@Module({
    imports: [ConfigModule, AuthModule, MongoDbModule],
    controllers: [GalleryController],
    providers: [GetService, StorageService, CacheService, MongoDbService],
})
export class GalleryModule {}
