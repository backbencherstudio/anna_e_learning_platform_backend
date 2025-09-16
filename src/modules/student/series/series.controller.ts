import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { SeriesService } from './series.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SeriesResponse } from './interfaces/series-response.interface';

@UseGuards(JwtAuthGuard)
@Controller('student/series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) { }

  @Get('enrolled')
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
}
