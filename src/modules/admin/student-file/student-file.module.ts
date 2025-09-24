import { Module } from '@nestjs/common';
import { StudentFileService } from './student-file.service';
import { StudentFileController } from './student-file.controller';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StudentFileController],
  providers: [StudentFileService],
  exports: [StudentFileService],
})
export class StudentFileModule { }
