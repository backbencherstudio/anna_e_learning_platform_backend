import { Controller, Get, Query, Param, UseGuards, HttpCode, HttpStatus, Post, Body } from '@nestjs/common';
import { StudentService } from './student.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guard/role/roles.guard';
import { Roles } from '../../../common/guard/role/roles.decorator';
import { Role } from '../../../common/guard/role/role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/student')
export class StudentController {
  constructor(private readonly studentService: StudentService) { }

  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('series_id') series_id?: string,
    @Query('course_id') course_id?: string,
  ) {
    return this.studentService.findAll(
      Number(page) || 1,
      Number(limit) || 10,
      search,
      series_id,
      course_id,
    );
  }

  @Get('name-email')
  @HttpCode(HttpStatus.OK)
  findAllNameEmail() {
    return this.studentService.findAllNameEmail();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id') id: string) {
    return this.studentService.findOne(id);
  }

  @Post(':id/notify')
  @HttpCode(HttpStatus.OK)
  async notify(
    @Param('id') id: string,
    @Body('message') message: string,
  ) {
    const result = await this.studentService.sendEmailNotification(id, message);
    return result;
  }
}
