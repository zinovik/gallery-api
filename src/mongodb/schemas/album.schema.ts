import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
class Resolved {
    @Prop({ type: [String], default: undefined })
    accesses?: string[];

    @Prop({ default: undefined })
    title?: string;

    @Prop({ default: undefined })
    order?: number;
}

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

    @Prop({ type: Resolved, default: undefined })
    resolved?: Resolved;
}

const AlbumSchema = SchemaFactory.createForClass(Album);

AlbumSchema.index({ path: 1 }, { unique: true });
AlbumSchema.index({ path: 1, 'resolved.accesses': 1 }, { unique: false });

export { Album, AlbumSchema };
