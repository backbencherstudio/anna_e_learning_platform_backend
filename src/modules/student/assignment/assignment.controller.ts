import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { RolesGuard } from '../../../common/guard/role/roles.guard';
import { Roles } from '../../../common/guard/role/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { Role } from 'src/common/guard/role/role.enum';
import { SubmitAssignmentDto } from './dto/submit-assignment.dto';

@Controller('student/assignment')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) { }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('series_id') series_id?: string,
    @Query('course_id') course_id?: string,
  ) {
    const userId = req.user?.userId;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.assignmentService.findAll(userId, pageNum, limitNum, search, series_id, course_id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId;
    return this.assignmentService.findOne(userId, id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async submit(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SubmitAssignmentDto,
  ) {
    const studentId = req.user?.userId;
    return this.assignmentService.submit(studentId, id, dto);
  }

  @Get(':id/submission')
  @HttpCode(HttpStatus.OK)
  async getSubmission(@Req() req: any, @Param('id') id: string) {
    const studentId = req.user?.userId;
    return this.assignmentService.getSubmission(studentId, id);
  }
}
