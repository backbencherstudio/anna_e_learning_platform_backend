import { Module } from '@nestjs/common';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { SeriesModule } from './series/series.module';
import { StudentFileModule } from './student-file/student-file.module';
;

@Module({
    imports: [
        EnrollmentModule,
        SeriesModule,
        StudentFileModule
    ],
})
export class StudentModule { }
