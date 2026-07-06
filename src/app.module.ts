import { MiddlewareConsumer, Module, ValidationPipe } from '@nestjs/common';
import { GalleryModule } from './gallery/gallery.module';
import { AuthModule } from './auth/auth.module';
import { JwtToUserMiddleware } from './auth/jwt-to-user.middleware';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggingInterceptor } from './app/logging.interceptor';
import { HttpExceptionFilter } from './app/http-exception.filter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration, { Configuration } from './app/configuration';
import { JwtService } from '@nestjs/jwt';
import { JwtUpdateInterceptor } from './auth/jwt-update.interceptor';
import { JwtParamToAccessedPathMiddleware } from './auth/jwt-param-to-accessed-path.middleware';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [configuration],
            envFilePath: '.env',
        }),
        GalleryModule,
        AuthModule,
        MongooseModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (
                configService: ConfigService<Configuration, true>
            ) => ({
                uri: configService.getOrThrow<string>('mongoUri', {
                    infer: true,
                }),
                autoIndex: true,
            }),
        }),
    ],
    providers: [
        {
            provide: APP_INTERCEPTOR,
            useClass: LoggingInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: JwtUpdateInterceptor,
        },
        {
            provide: APP_PIPE,
            useValue: new ValidationPipe({ transform: true }),
        },
        {
            provide: APP_FILTER,
            useClass: HttpExceptionFilter,
        },
        JwtService,
    ],
})
export class AppModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(JwtToUserMiddleware).forRoutes('*');
        consumer.apply(JwtParamToAccessedPathMiddleware).forRoutes('get');
        consumer.apply(JwtParamToAccessedPathMiddleware).forRoutes('get/*path');
    }
}
