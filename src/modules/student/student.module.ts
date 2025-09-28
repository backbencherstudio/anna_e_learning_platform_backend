import { Module } from '@nestjs/common';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { SeriesModule } from './series/series.module';
import { StudentFileModule } from './student-file/student-file.module';
import { MaterialsModule } from './materials/materials.module';
import { CheckoutModule } from './checkout/checkout.module';
import { AssignmentModule } from './assignment/assignment.module';
import { QuizModule } from './quiz/quiz.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ContactModule } from './contact/contact.module';
import { ScheduleEventModule } from './schedule-event/schedule-event.module';
import { NotificationModule } from './notification/notification.module';
import { DashboardModule } from './dashboard/dashboard.module';
;

@Module({
    imports: [
        EnrollmentModule,
        SeriesModule,
        StudentFileModule,
        MaterialsModule,
        CheckoutModule,
        AssignmentModule,
        QuizModule,
        FeedbackModule,
        ContactModule,
        ScheduleEventModule,
        NotificationModule,
        DashboardModule,
    ],
})
export class StudentModule { }
