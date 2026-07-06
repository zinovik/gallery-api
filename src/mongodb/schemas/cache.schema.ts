import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema()
class Cache<T> {
    @Prop({ required: true })
    cacheKey!: string;

    @Prop({ required: true, type: MongooseSchema.Types.Mixed })
    data!: T;

    @Prop({ required: true })
    expiresAt!: Date;
}

const CacheSchema = SchemaFactory.createForClass(Cache);

CacheSchema.index({ cacheKey: 1 }, { unique: true });
CacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export { Cache, CacheSchema };
