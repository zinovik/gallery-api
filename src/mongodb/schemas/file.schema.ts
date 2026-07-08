import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
class File {
    @Prop({ required: true })
    filename!: string;

    @Prop({ default: undefined })
    path?: string;

    @Prop({ default: undefined })
    description?: string;

    @Prop({ type: mongoose.Schema.Types.Mixed, default: undefined })
    text?: string | string[];

    @Prop({ default: undefined })
    tags?: string[];

    @Prop({ default: undefined })
    accesses?: string[];
}

const FileSchema = SchemaFactory.createForClass(File);

FileSchema.index({ filename: 1 }, { unique: true });

export { File, FileSchema };
