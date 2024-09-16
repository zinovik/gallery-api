import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { StorageService } from '../storage/storage.service';

@Module({
    providers: [UsersService, StorageService],
    exports: [UsersService],
})
export class UsersModule {}
