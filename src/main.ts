import compression from 'compression';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'body-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Configuration } from './app/configuration';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService<Configuration, true>);
    app.enableCors({
        origin: configService.getOrThrow('origin', { infer: true }),
        credentials: true,
    });
    app.use(json({ limit: '5mb' }));
    app.use(compression());

    const config = new DocumentBuilder()
        .setTitle('Billing management API')
        .setDescription('Billing management API')
        .setVersion('1.0')
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document, {
        swaggerOptions: {
            tagsSorter: 'alpha',
            operationsSorter: 'alpha',
        },
    });

    await app.listen(8080);
}
bootstrap();
