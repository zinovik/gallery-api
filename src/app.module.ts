import { Module } from '@nestjs/common';
import { EditModule } from './gallery/edit.module';

@Module({
    imports: [EditModule],
})
export class AppModule {}
