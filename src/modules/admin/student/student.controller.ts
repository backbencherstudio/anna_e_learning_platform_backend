import { Controller, Get, Query, Param, UseGuards, HttpCode, HttpStatus, Post, Body, Res, Header, UploadedFile, UseInterceptors, Delete, Patch } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
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

  @Post('notify')
  @HttpCode(HttpStatus.OK)
  async notify(
    @Body('student_id') student_id: string,
    @Body('message') message: string,
  ) {
    const result = await this.studentService.sendEmailNotification(student_id, message);
    return result;
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id') id: string) {
    return this.studentService.findOne(id);
  }

  @Get(':id/download')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment')
  async downloadUserDetails(@Param('id') id: string, @Res() res: Response) {
    const result = await this.studentService.downloadUserDetailsAsCSV(id);

    if (result.success) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.data.filename}"`);
      res.send(result.data.csv);
    } else {
      res.status(HttpStatus.NOT_FOUND).json(result);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return this.studentService.remove(id);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: number,
  ) {
    return this.studentService.updateStatus(id, status);
  }

}
