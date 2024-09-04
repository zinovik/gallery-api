import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'body-parser';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.enableCors({
        origin: process.env.DEVELOPMENT
            ? 'http://localhost:3000'
            : 'https://zinovik.github.io',
        credentials: true,
    });
    app.use(json({ limit: '5mb' }));
    app.use(cookieParser());
    await app.listen(8080);
}
bootstrap();
