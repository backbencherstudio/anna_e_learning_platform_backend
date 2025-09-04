import { Module } from '@nestjs/common';
import { NotificationModule } from './notification/notification.module';
import { ContactModule } from './contact/contact.module';
import { FaqModule } from './faq/faq.module';
import { CourseModule } from './course/course.module';

@Module({
  imports: [NotificationModule, ContactModule, FaqModule, CourseModule],
})
export class ApplicationModule {}
