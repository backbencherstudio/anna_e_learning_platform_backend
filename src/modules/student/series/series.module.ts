import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SeriesService } from './series.service.refactored';
import { SeriesController } from './series.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SeriesServicesModule } from './series-services.module';
import appConfig from '../../../config/app.config';

@Module({
  imports: [
    PrismaModule,
    SeriesServicesModule,
    JwtModule.registerAsync({
      useFactory: async () => ({
        secret: appConfig().jwt.secret,
        signOptions: { expiresIn: appConfig().jwt.expiry },
      }),
    }),
  ],
  controllers: [SeriesController],
  providers: [SeriesService],
  exports: [SeriesService],
})
export class SeriesModule { }
