import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { SeriesService } from './series.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SeriesResponse } from './interfaces/series-response.interface';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';

@ApiTags('student-series')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@Controller('student/series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) { }

  @Get('enrolled')
  @ApiOperation({ summary: 'Get enrolled series with lesson progress' })
  async getEnrolledSeries(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ): Promise<SeriesResponse<{ series: any[]; pagination: any }>> {
    const userId = req.user.userId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    return this.seriesService.getEnrolledSeries(userId, pageNum, limitNum, search);
  }

  @Post('lessons/:lessonId/view')
  @ApiOperation({ summary: 'Mark lesson as viewed' })
  async markLessonAsViewed(
    @Req() req: any,
    @Param('lessonId') lessonId: string,
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.markLessonAsViewed(userId, lessonId);
  }

  @Post('lessons/:lessonId/complete')
  @ApiOperation({ summary: 'Mark lesson as completed' })
  async markLessonAsCompleted(
    @Req() req: any,
    @Param('lessonId') lessonId: string,
    @Body() completionData?: {
      time_spent?: number;
      last_position?: number;
      completion_percentage?: number;
    },
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.markLessonAsCompleted(userId, lessonId, completionData);
  }

  @Get('lessons/:lessonId/progress')
  @ApiOperation({ summary: 'Get lesson progress' })
  async getLessonProgress(
    @Req() req: any,
    @Param('lessonId') lessonId: string,
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.getLessonProgress(userId, lessonId);
  }

  @Get('courses')
  @ApiOperation({ summary: 'Get all courses with lesson files and progress' })
  async findAllCourses(
    @Req() req: any,
    @Query('series_id') seriesId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<SeriesResponse<{ courses: any[]; pagination: any }>> {
    const userId = req.user.userId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    return this.seriesService.findAllCourses(userId, seriesId, pageNum, limitNum);
  }

  @Get('courses/:courseId')
  @ApiOperation({ summary: 'Get single course with lesson files and progress' })
  async findOneCourse(
    @Req() req: any,
    @Param('courseId') courseId: string,
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.findOneCourse(userId, courseId);
  }

  @Get('lessons')
  @ApiOperation({ summary: 'Get all lessons with progress' })
  async findAllLessons(
    @Req() req: any,
    @Query('course_id') courseId?: string,
    @Query('series_id') seriesId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<SeriesResponse<{ lessons: any[]; pagination: any }>> {
    const userId = req.user.userId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    return this.seriesService.findAllLessons(userId, courseId, seriesId, pageNum, limitNum);
  }

  @Get('lessons/:lessonId')
  @ApiOperation({ summary: 'Get single lesson with progress' })
  async findOneLesson(
    @Req() req: any,
    @Param('lessonId') lessonId: string,
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.findOneLesson(userId, lessonId);
  }
}
