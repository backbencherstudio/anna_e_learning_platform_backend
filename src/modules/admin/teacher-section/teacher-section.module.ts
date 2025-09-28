import { Module } from '@nestjs/common';
import { TeacherSectionService } from './teacher-section.service';
import { TeacherSectionController } from './teacher-section.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { QueueModule } from '../../queue/queue.module';

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [TeacherSectionController],
  providers: [TeacherSectionService],
})
export class TeacherSectionModule { }
