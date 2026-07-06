import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
class User {
    @Prop({ required: true })
    email!: string;

    @Prop({ required: true })
    accesses!: string[];

    @Prop({ required: true })
    isEditAccess!: boolean;
}

const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 }, { unique: true });

export { User, UserSchema };
