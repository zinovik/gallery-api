import { MiddlewareConsumer, Module, ValidationPipe } from '@nestjs/common';
import { MainModule } from './main/main.module';
import { AuthModule } from './auth/auth.module';
import { JwtToUserMiddleware } from './auth/jwt-to-user.middleware';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggingInterceptor } from './logging/logging.interceptor';
import { JwtUpdate } from './auth/jwt-update.interceptor';
import { HttpExceptionFilter } from './exceptions/http-exception.filter';

@Module({
    imports: [MainModule, AuthModule],
    providers: [
        {
            provide: APP_INTERCEPTOR,
            useClass: LoggingInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: JwtUpdate,
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
