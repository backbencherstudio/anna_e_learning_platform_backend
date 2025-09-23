import { Module } from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { AssignmentController } from './assignment.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { QueueModule } from '../../queue/queue.module';

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [AssignmentController],
  providers: [AssignmentService],
  exports: [AssignmentService],
})
export class AssignmentModule { }
