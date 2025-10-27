import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, Res, Headers, Options } from '@nestjs/common';
import { SeriesService } from './series.service.refactored';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SeriesResponse } from './interfaces/series-response.interface';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';
import { VideoProgressService } from './services/video-progress.service';
import { VideoProgressResponse } from './types/video-progress.types';

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

  @Get('lessons/:lessonId/stream')
  @ApiOperation({ summary: 'Stream lesson video' })
  async streamLessonVideo(
    @Req() req: any,
    @Param('lessonId') lessonId: string,
    @Res() res: any,
    @Headers('range') range?: string,
  ) {
    const userId = req.user.userId;
    return this.seriesService.streamLessonVideo(userId, lessonId, res, range);
  }

  @Options('lessons/:lessonId/stream')
  @ApiOperation({ summary: 'Handle preflight request for video streaming' })
  async handleStreamPreflight(@Res() res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range, Content-Length, Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(204).send();
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

  @Get('watched-lessons')
  @ApiOperation({ summary: 'Get all watched lessons with pagination' })
  async getAllWatchedLessons(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<SeriesResponse<{ watchedLessons: any[]; pagination: any }>> {
    const userId = req.user.userId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 5;

    return this.seriesService.getAllWatchedLessons(userId, pageNum, limitNum);
  }

  @Get('last-watched-lesson')
  @ApiOperation({ summary: 'Get last watched lesson across all enrolled series' })
  async getLastWatchedLesson(
    @Req() req: any,
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.getLastWatchedLesson(userId);
  }

  // ==================== VIDEO PROGRESS ENDPOINTS ====================

  @Post('courses/:courseId/intro-video/progress')
  @ApiOperation({ summary: 'Update intro video progress, unlock first lesson at 90%, and auto-complete at 100%' })
  async updateIntroVideoProgress(
    @Req() req: any,
    @Param('courseId') courseId: string,
    @Body() progressData: {
      time_spent?: number;
      last_position?: number;
      completion_percentage?: number;
    },
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.updateIntroVideoProgress(userId, courseId, progressData);
  }

  @Post('courses/:courseId/end-video/progress')
  @ApiOperation({ summary: 'Update end video progress and auto-complete if 100% watched' })
  async updateEndVideoProgress(
    @Req() req: any,
    @Param('courseId') courseId: string,
    @Body() progressData: {
      time_spent?: number;
      last_position?: number;
      completion_percentage?: number;
    },
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.updateEndVideoProgress(userId, courseId, progressData);
  }

  @Post('courses/:courseId/intro-video/complete')
  @ApiOperation({ summary: 'Mark intro video as completed and unlock first lesson' })
  async markIntroVideoAsCompleted(
    @Req() req: any,
    @Param('courseId') courseId: string,
    @Body() completionData?: {
      time_spent?: number;
      last_position?: number;
      completion_percentage?: number;
    },
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.markIntroVideoAsCompleted(userId, courseId, completionData);
  }

  @Post('courses/:courseId/end-video/complete')
  @ApiOperation({ summary: 'Mark end video as completed and unlock next lesson' })
  async markEndVideoAsCompleted(
    @Req() req: any,
    @Param('courseId') courseId: string,
    @Body() completionData?: {
      time_spent?: number;
      last_position?: number;
      completion_percentage?: number;
    },
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    return this.seriesService.markEndVideoAsCompleted(userId, courseId, completionData);
  }

  // ==================== LESSON UNLOCK ENDPOINTS ====================

  @Post('series/:seriesId/unlock-first-lesson')
  @ApiOperation({ summary: 'Unlock first lesson for a series (for enrollment)' })
  async unlockFirstLessonForUser(
    @Req() req: any,
    @Param('seriesId') seriesId: string,
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    await this.seriesService.unlockFirstLessonForUser(userId, seriesId);
    return {
      success: true,
      message: 'First lesson unlocked successfully',
      data: { seriesId },
    };
  }

  @Post('lessons/:lessonId/unlock-next')
  @ApiOperation({ summary: 'Unlock next lesson after completing current one' })
  async unlockNextLesson(
    @Req() req: any,
    @Param('lessonId') lessonId: string,
    @Body() body: { courseId: string },
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    await this.seriesService.unlockNextLesson(userId, lessonId, body.courseId);
    return {
      success: true,
      message: 'Next lesson unlocked successfully',
      data: { lessonId, courseId: body.courseId },
    };
  }

  @Post('courses/:courseId/start-next-course')
  @ApiOperation({ summary: 'Start next course after completing current one' })
  async startNextCourse(
    @Req() req: any,
    @Param('courseId') courseId: string,
    @Body() body: { seriesId: string },
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    await this.seriesService.startNextCourse(userId, courseId, body.seriesId);
    return {
      success: true,
      message: 'Next course started successfully',
      data: { courseId, seriesId: body.seriesId },
    };
  }

  // ==================== COURSE PROGRESS ENDPOINTS ====================

  @Post('courses/:courseId/update-progress')
  @ApiOperation({ summary: 'Update course progress based on completed lessons' })
  async updateCourseProgress(
    @Req() req: any,
    @Param('courseId') courseId: string,
    @Body() body: { seriesId: string },
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    await this.seriesService.updateCourseProgress(userId, courseId, body.seriesId);
    return {
      success: true,
      message: 'Course progress updated successfully',
      data: { courseId, seriesId: body.seriesId },
    };
  }

  @Post('series/:seriesId/update-enrollment-progress')
  @ApiOperation({ summary: 'Update enrollment progress percentage' })
  async updateEnrollmentProgress(
    @Req() req: any,
    @Param('seriesId') seriesId: string,
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    await this.seriesService.updateEnrollmentProgress(userId, seriesId);
    return {
      success: true,
      message: 'Enrollment progress updated successfully',
      data: { seriesId },
    };
  }

  // ==================== UTILITY ENDPOINTS ====================

  @Get('courses/:courseId/lesson-progress')
  @ApiOperation({ summary: 'Get lesson progress for a specific course' })
  async getLessonProgressForCourse(
    @Req() req: any,
    @Param('courseId') courseId: string,
  ): Promise<SeriesResponse<any>> {
    const userId = req.user.userId;
    const progress = await this.seriesService.getLessonProgressForCourse(userId, courseId);
    return {
      success: true,
      message: 'Lesson progress retrieved successfully',
      data: progress,
    };
  }
}
