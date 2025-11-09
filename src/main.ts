// external imports
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import { join } from 'path';
// internal imports
import { AppModule } from './app.module';
import appConfig from './config/app.config';
import { CustomExceptionFilter } from './common/exception/custom-exception.filter';
import { SojebStorage } from './common/lib/Disk/SojebStorage';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: true,
  });

  // Handle raw body for webhooks - must be before any other middleware
  app.use('/api/payment/stripe/webhook', require('express').raw({
    type: 'application/json',
    verify: (req, res, buf, encoding) => {
      req.rawBody = buf;
    }
  }));

  app.setGlobalPrefix('api');
  app.useWebSocketAdapter(new IoAdapter(app));

  // Configure express for large file uploads
  app.use(require('express').json({ limit: '100mb' }));
  app.use(require('express').urlencoded({ limit: '100mb', extended: true }));


  // Configure CORS to handle preflight requests properly
  app.enableCors({
    origin: ['*', 'http://localhost:3000', 'http://localhost:4000', 'http://127.0.0.1:5500', 'http://127.0.0.1:5501', 'http://31.97.209.156:3000', 'boraborsorkar.com', 'https://thewhiteeaglesacademy.com/', 'http://thewhiteeaglesacademy.com', 'https://www.frontend.thewhiteeaglesacademy.com'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'x-drm-token',
      'Cache-Control',
      'X-HTTP-Method-Override',
      'Range',
      'Content-Range',
      'Content-Length',
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  app.use(helmet());
  // Enable it, if special charactrers not encoding perfectly
  // app.use((req, res, next) => {
  //   // Only force content-type for specific API routes, not Swagger or assets
  //   if (req.path.startsWith('/api') && !req.path.startsWith('/api/docs')) {
  //     res.setHeader('Content-Type', 'application/json; charset=utf-8');
  //   }
  //   next();
  // });
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    index: false,
    prefix: '/public',
  });
  app.useStaticAssets(join(__dirname, '..', 'public/storage'), {
    index: false,
    prefix: '/storage',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );
  app.useGlobalFilters(new CustomExceptionFilter());

  // storage setup - MinIO/S3 configuration
  SojebStorage.config({
    driver: 'local', // Use S3 driver for MinIO
    connection: {
      rootUrl: appConfig().storageUrl.rootUrl,
      publicUrl: appConfig().storageUrl.rootUrlPublic,
      // MinIO/S3 configuration
      awsBucket: appConfig().fileSystems.s3.bucket,
      awsAccessKeyId: appConfig().fileSystems.s3.key,
      awsSecretAccessKey: appConfig().fileSystems.s3.secret,
      awsDefaultRegion: appConfig().fileSystems.s3.region,
      awsEndpoint: appConfig().fileSystems.s3.endpoint,
      minio: true, // Enable MinIO mode
    },
  });

  // swagger
  const options = new DocumentBuilder()
    .setTitle(`${process.env.APP_NAME} api`)
    .setDescription(`${process.env.APP_NAME} api docs`)
    .setVersion('1.0')
    .addTag(`${process.env.APP_NAME}`)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api/docs', app, document);
  // end swagger

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
}
bootstrap();
