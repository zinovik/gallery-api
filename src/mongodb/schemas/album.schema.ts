import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
class Album {
    @Prop({ required: true })
    path!: string;

    @Prop({ default: undefined })
    title?: string;

    @Prop({ type: mongoose.Schema.Types.Mixed, default: undefined })
    text?: string | string[];

    @Prop({ default: undefined })
    defaultByDate?: boolean;

    @Prop({ default: undefined })
    accesses?: string[];

    @Prop({ default: undefined })
    defaultAccesses?: string[];

    @Prop({ default: undefined })
    order?: number;
}

const AlbumSchema = SchemaFactory.createForClass(Album);

AlbumSchema.index({ path: 1 }, { unique: true });

export { Album, AlbumSchema };
