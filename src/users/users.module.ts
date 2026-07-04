import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { CacheService } from '../cache/cache.service';
import { MongoDbService } from '../mongodb/mongodb.service';

@Module({
    providers: [UsersService, CacheService, MongoDbService],
    exports: [UsersService],
})
export class UsersModule {}
