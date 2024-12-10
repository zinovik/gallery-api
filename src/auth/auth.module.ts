import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [
        ConfigModule,
        UsersModule,
        JwtModule.register({
            global: true,
            secret: process.env['DEVELOPMENT']
                ? 'local-development-secret'
                : process.env['JWT_SECRET'],
            signOptions: { expiresIn: '1h' },
        }),
        // JwtModule.registerAsync({
        //     imports: [ConfigModule],
        //     inject: [ConfigService],
        //     useFactory: async (configService: ConfigService) => ({
        //         global: true,
        //         secret: configService.get<string>('jwtSecret'),
        //         signOptions: { expiresIn: '1h' },
        //     }),
        // }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        {
            provide: APP_GUARD,
            useClass: AuthGuard,
        },
    ],
    exports: [AuthService],
})
export class AuthModule {}
