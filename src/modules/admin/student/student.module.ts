import { Module } from '@nestjs/common';
import { StudentService } from './student.service';
import { StudentController } from './student.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailModule } from 'src/mail/mail.module';
import { MessageGateway } from 'src/modules/chat/message/message.gateway';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [StudentController],
  providers: [StudentService, MessageGateway],
})
export class StudentModule { }
