import { Module } from '@nestjs/common';
import { GetModule } from './get/get.module';
import { EditModule } from './edit/edit.module';

@Module({
    imports: [GetModule, EditModule],
})
export class AppModule {}
