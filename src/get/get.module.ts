import { Module } from '@nestjs/common';
import { GetController } from './get.controller';
import { StorageService } from '../storage/storage.service';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [AuthModule],
    controllers: [GetController],
    providers: [StorageService],
})
export class GetModule {}
