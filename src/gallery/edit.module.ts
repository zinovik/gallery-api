import { Module } from '@nestjs/common';
import { EditController } from './edit.controller';
import { StorageService } from '../storage/storage.service';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [AuthModule],
    controllers: [EditController],
    providers: [StorageService],
})
export class EditModule {}
