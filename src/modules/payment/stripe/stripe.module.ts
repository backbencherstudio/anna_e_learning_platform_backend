import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { EnrollmentService } from '../../student/enrollment/enrollment.service';
import { SeriesModule } from '../../student/series/series.module';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, SeriesModule],
  controllers: [StripeController],
  providers: [StripeService, EnrollmentService],
})
export class StripeModule { }
