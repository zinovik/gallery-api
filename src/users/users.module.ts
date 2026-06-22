import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { CacheService } from '../cache/cache.service';
import { FirestoreService } from '../firestore/firestore.service';

@Module({
    providers: [UsersService, CacheService, FirestoreService],
    exports: [UsersService],
})
export class UsersModule {}
