import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { EnrollmentService } from '../../student/enrollment/enrollment.service';
import { SeriesService } from '../../student/series/series.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StripeController],
  providers: [StripeService, EnrollmentService, SeriesService],
})
export class StripeModule { }
