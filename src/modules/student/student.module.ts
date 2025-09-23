import { Module } from '@nestjs/common';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { SeriesModule } from './series/series.module';
import { StudentFileModule } from './student-file/student-file.module';
import { MaterialsModule } from './materials/materials.module';
import { CheckoutModule } from './checkout/checkout.module';
import { AssignmentModule } from './assignment/assignment.module';
;

@Module({
    imports: [
        EnrollmentModule,
        SeriesModule,
        StudentFileModule,
        MaterialsModule,
        CheckoutModule,
        AssignmentModule
    ],
})
export class StudentModule { }
