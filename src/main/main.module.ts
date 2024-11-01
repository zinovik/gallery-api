import { Module } from '@nestjs/common';
import { MainController } from './main.controller';
import { StorageService } from '../storage/storage.service';
import { AuthModule } from '../auth/auth.module';
import { GetService } from './get.service';
import { EditService } from './edit.service';
import { UtilsService } from './utils.service';

@Module({
    imports: [AuthModule],
    controllers: [MainController],
    providers: [StorageService, GetService, EditService, UtilsService],
})
export class MainModule {}
