import { MiddlewareConsumer, Module, ValidationPipe } from '@nestjs/common';
import { GalleryModule } from './gallery/gallery.module';
import { AuthModule } from './auth/auth.module';
import { JwtToUserMiddleware } from './auth/jwt-to-user.middleware';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggingInterceptor } from './global/logging.interceptor';
import { HttpExceptionFilter } from './global/http-exception.filter';
import { ConfigModule } from '@nestjs/config';
import configuration from './global/configuration';

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [configuration],
        }),
        GalleryModule,
        AuthModule,
    ],
    providers: [
        {
            provide: APP_INTERCEPTOR,
            useClass: LoggingInterceptor,
        },
        {
            provide: APP_PIPE,
            useClass: ValidationPipe,
        },
        {
            provide: APP_FILTER,
            useClass: HttpExceptionFilter,
        },
    ],
})
export class AppModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(JwtToUserMiddleware).forRoutes('*');
    }
}
