import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoDbService } from '../mongodb/mongodb.service';
import { File, FileSchema } from './schemas/file.schema';
import { Album, AlbumSchema } from './schemas/album.schema';
import { User, UserSchema } from './schemas/user.schema';
import { Cache, CacheSchema } from './schemas/cache.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: File.name, schema: FileSchema },
            { name: Album.name, schema: AlbumSchema },
            { name: User.name, schema: UserSchema },
            { name: Cache.name, schema: CacheSchema },
        ]),
    ],
    providers: [MongoDbService],
    exports: [MongoDbService, MongooseModule],
})
export class MongoDbModule {}
