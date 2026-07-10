import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
class Resolved {
    @Prop({ type: [String], default: undefined })
    accesses?: string[];

    @Prop({ default: undefined })
    path?: string;

    @Prop({ default: undefined })
    storagePath?: string;
}

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

    @Prop({ type: [String], default: undefined })
    tags?: string[];

    @Prop({ type: [String], default: undefined })
    accesses?: string[];

    @Prop({ type: Resolved, default: undefined })
    resolved?: Resolved;
}

const FileSchema = SchemaFactory.createForClass(File);

FileSchema.index({ filename: 1 }, { unique: true });

export { File, FileSchema };
