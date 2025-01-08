import { MiddlewareConsumer, Module, ValidationPipe } from '@nestjs/common';
import { GalleryModule } from './gallery/gallery.module';
import { AuthModule } from './auth/auth.module';
import { JwtToUserMiddleware } from './auth/jwt-to-user.middleware';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggingInterceptor } from './app/logging.interceptor';
import { HttpExceptionFilter } from './app/http-exception.filter';
import { ConfigModule } from '@nestjs/config';
import configuration from './app/configuration';
import { JwtService } from '@nestjs/jwt';
import { JwtUpdateInterceptor } from './auth/jwt-update.interceptor';
import { JwtParamToAccessedPathMiddleware } from './auth/jwt-param-to-accessed-path.middleware';

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
        consumer.apply(JwtParamToAccessedPathMiddleware).forRoutes('get/*');
    }
}
