import { Module } from '@nestjs/common';
import { TeacherSectionService } from './teacher-section.service';
import { TeacherSectionController } from './teacher-section.controller';

@Module({
  controllers: [TeacherSectionController],
  providers: [TeacherSectionService],
})
export class TeacherSectionModule {}
