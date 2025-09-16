import { Module } from '@nestjs/common';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { SeriesModule } from './series/series.module';
;

@Module({
    imports: [
        EnrollmentModule,
        SeriesModule
    ],
})
export class StudentModule { }
