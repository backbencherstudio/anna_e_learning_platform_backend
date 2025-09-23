import { Module } from '@nestjs/common';
import { ScholarshipCodeService } from './scholarship-code.service';
import { ScholarshipCodeController } from './scholarship-code.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ScholarshipCodeController],
  providers: [ScholarshipCodeService],
})
export class ScholarshipCodeModule { }
