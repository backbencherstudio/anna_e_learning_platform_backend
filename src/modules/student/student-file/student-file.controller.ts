import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseInterceptors, UploadedFile, UseGuards, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StudentFileService } from './student-file.service';
import { CreateStudentFileDto } from './dto/create-student-file.dto';
import { UpdateStudentFileDto } from './dto/update-student-file.dto';
import { StudentFileResponse } from './interfaces/student-file-response.interface';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from 'src/common/guard/role/role.enum';


@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)

@Controller('student/student-files')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class StudentFileController {
  constructor(private readonly studentFileService: StudentFileService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @Req() req: any,
    @Body() createStudentFileDto: CreateStudentFileDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<StudentFileResponse<any>> {
    const user_id = req.user.userId;
    return this.studentFileService.create(createStudentFileDto, user_id, file);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('series_id') series_id?: string,
    @Query('course_id') course_id?: string,
    @Query('section_type') section_type?: string,
    @Query('week_number') week_number?: string,
  ): Promise<StudentFileResponse<{ student_files: any[]; pagination: any }>> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const weekNum = week_number ? parseInt(week_number, 10) : undefined;

    return this.studentFileService.findAll(pageNum, limitNum, search, series_id, course_id, section_type, weekNum);
  }

  @Get('series/:series_id')
  @HttpCode(HttpStatus.OK)
  async findBySeries(@Param('series_id') series_id: string): Promise<StudentFileResponse<any[]>> {
    return this.studentFileService.findBySeries(series_id);
  }

  @Get('course/:course_id')
  @HttpCode(HttpStatus.OK)
  async findByCourse(@Param('course_id') course_id: string): Promise<StudentFileResponse<any[]>> {
    return this.studentFileService.findByCourse(course_id);
  }

  @Get('week/:week_number')
  @HttpCode(HttpStatus.OK)
  async findByWeek(
    @Param('week_number') week_number: string,
    @Query('series_id') series_id?: string,
    @Query('course_id') course_id?: string,
  ): Promise<StudentFileResponse<any[]>> {
    const weekNum = parseInt(week_number, 10);
    return this.studentFileService.findByWeek(weekNum, series_id, course_id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string): Promise<StudentFileResponse<any>> {
    return this.studentFileService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @Param('id') id: string,
    @Body() updateStudentFileDto: UpdateStudentFileDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<StudentFileResponse<any>> {
    return this.studentFileService.update(id, updateStudentFileDto, file);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string): Promise<StudentFileResponse<null>> {
    return this.studentFileService.remove(id);
  }
}