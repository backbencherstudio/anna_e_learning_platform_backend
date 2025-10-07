import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe
} from "@nestjs/common";
import { ScheduleEventService } from "./schedule-event.service";
import { CreateScheduleEventDto } from "./dto/create-schedule-event.dto";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guard/role/roles.guard";
import { Roles } from "../../../common/guard/role/roles.decorator";
import { Role } from "../../../common/guard/role/role.enum";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller("admin/schedule-event")
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ScheduleEventController {
  constructor(private readonly scheduleEventService: ScheduleEventService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createScheduleEventDto: CreateScheduleEventDto) {
    return this.scheduleEventService.create(createScheduleEventDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @Req() req,
    @Query("date") date?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("type") type?: string,
    @Query("status") status?: string,
    @Query("seriesId") seriesId?: string,
  ) {
    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : 1;
    const limitNumber = limit ? Math.max(1, Math.min(100, parseInt(limit, 10))) : 10;

    return this.scheduleEventService.listScheduleEvents(
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

    //delete schedule event
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    async deleteScheduleEvent(@Param('id') id: string) {
      return this.scheduleEventService.remove(id);
    }
}
