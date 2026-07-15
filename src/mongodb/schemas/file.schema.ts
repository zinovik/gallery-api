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

    @Prop({ default: undefined })
    rootPath?: string;
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
FileSchema.index(
    { 'resolved.path': 1, 'resolved.accesses': 1 },
    { unique: false }
);
FileSchema.index(
    { 'resolved.rootPath': 1, 'resolved.accesses': 1 },
    { unique: false }
);

export { File, FileSchema };
