import { Module } from '@nestjs/common';
import { MongoDbService } from '../mongodb/mongodb.service';
import { FileSchema } from '../schemas/file.schema';
import { AlbumSchema } from '../schemas/album.schema';
import { UserSchema } from '../schemas/user.schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: 'File', schema: FileSchema },
            { name: 'Album', schema: AlbumSchema },
            { name: 'User', schema: UserSchema },
        ]),
    ],
    providers: [MongoDbService],
    exports: [MongoDbService, MongooseModule],
})
export class MongoDbModule {}
