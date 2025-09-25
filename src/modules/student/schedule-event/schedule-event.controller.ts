import { Controller, Get, HttpCode, HttpStatus, Query, Req, UseGuards } from '@nestjs/common';
import { ScheduleEventService } from './schedule-event.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guard/role/roles.guard';
import { Roles } from '../../../common/guard/role/roles.decorator';
import { Role } from '../../../common/guard/role/role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@Controller('student/schedule-event')
export class ScheduleEventController {
  constructor(private readonly scheduleEventService: ScheduleEventService) { }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@Req() req, @Query('from') from?: string, @Query('to') to?: string) {
    const userId = req.user.userId;
    return this.scheduleEventService.listForEnrolledSeries(userId, from, to);
  }
}
