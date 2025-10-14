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

  @Get()
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

  @Get('series-title')
  async getSeriesTitle(
    @Req() req: any,
    @Param('seriesId') seriesId: string,
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.getSeriesTitle(userId);
  }

  @Get('single/:seriesId')
  @ApiOperation({ summary: 'Get a single enrolled series by ID' })
  async getEnrolledSeriesById(
    @Req() req: any,
    @Param('seriesId') seriesId: string,
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.getEnrolledSeriesById(userId, seriesId);
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

  @Get('lessons/:lessonId')
  @ApiOperation({ summary: 'Get single lesson with progress' })
  async findOneLesson(
    @Req() req: any,
    @Param('lessonId') lessonId: string,
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.findOneLesson(userId, lessonId);
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

  @Post('lessons/:lessonId/progress')
  @ApiOperation({ summary: 'Update video progress and auto-complete lesson if 90%+ watched' })
  async updateVideoProgress(
    @Req() req: any,
    @Param('lessonId') lessonId: string,
    @Body() progressData: {
      time_spent?: number;
      last_position?: number;
      completion_percentage?: number;
    },
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.updateVideoProgress(userId, lessonId, progressData);
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

  @Get('courses/:courseId/progress')
  @ApiOperation({ summary: 'Get course progress for a specific course' })
  async getCourseProgress(
    @Req() req: any,
    @Param('courseId') courseId: string,
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.getCourseProgress(userId, courseId);
  }

  @Get('series/:seriesId/course-progress')
  @ApiOperation({ summary: 'Get all course progress for a series' })
  async getAllCourseProgress(
    @Req() req: any,
    @Param('seriesId') seriesId: string,
  ): Promise<SeriesResponse<{ courseProgress: any[] }>> {
    const userId = req.user.userId;
    return this.seriesService.getAllCourseProgress(userId, seriesId);
  }
}
