import { Module } from '@nestjs/common';
import { FaqModule } from './faq/faq.module';
import { ContactModule } from './contact/contact.module';
import { WebsiteInfoModule } from './website-info/website-info.module';
import { PaymentTransactionModule } from './payment-transaction/payment-transaction.module';
import { UserModule } from './user/user.module';
import { NotificationModule } from './notification/notification.module';
import { QuizModule } from './quiz/quiz.module';
import { AssignmentModule } from './assignment/assignment.module';
import { LanguageModule } from './language/language.module';
import { SeriesModule } from './series/series.module';
import { MaterialsModule } from './materials/materials.module';

@Module({
  imports: [
    FaqModule,
    ContactModule,
    WebsiteInfoModule,
    PaymentTransactionModule,
    UserModule,
    NotificationModule,
    QuizModule,
    AssignmentModule,
    LanguageModule,
    SeriesModule,
    MaterialsModule,
  ],
})
export class AdminModule { }
