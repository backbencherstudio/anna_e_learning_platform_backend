import { Controller, Get, HttpCode, HttpStatus, Param, Query, Req, UseGuards } from '@nestjs/common';
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
  async list(
    @Req() req,
    @Query('date') date?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('seriesId') seriesId?: string,
  ) {
    const userId = req.user.userId;
    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : 1;
    const limitNumber = limit ? Math.max(1, Math.min(100, parseInt(limit, 10))) : 10; // Max 100 items per page

    return this.scheduleEventService.listForEnrolledSeries(
      userId,
      date,
      pageNumber,
      limitNumber,
      type,
      status,
      seriesId,
    );
  }

  // get single schedule event
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getSingleScheduleEvent(@Req() req: any, @Param('id') id: string) {
    return this.scheduleEventService.getSingleScheduleEvent( id);
  }
}
