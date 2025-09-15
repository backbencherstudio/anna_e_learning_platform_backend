import { Module } from '@nestjs/common';
import { EnrollmentModule } from './enrollment.module';
;

@Module({
  imports: [EnrollmentModule],
})
export class StudentModule {}
