import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SeriesService } from './series.service.refactored';
import { SeriesController } from './series.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SeriesServicesModule } from './series-services.module';

@Module({
  imports: [
    PrismaModule,
    SeriesServicesModule,
    JwtModule.registerAsync({
      useFactory: async () => ({
        secret: (await import('src/config/app.config')).default().jwt.secret,
        signOptions: { expiresIn: (await import('src/config/app.config')).default().jwt.expiry },
      }),
    }),
  ],
  controllers: [SeriesController],
  providers: [SeriesService],
  exports: [SeriesService],
})
export class SeriesModule { }
