import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ReportService } from './report.service';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/report')
export class ReportController {
  constructor(private readonly reportService: ReportService) { }


  @Get('website-traffic')
  @HttpCode(HttpStatus.OK)
  async getWebsiteTraffic() {
    return this.reportService.getWebsiteTraffic();
  }

  @Get('series-progress')
  @HttpCode(HttpStatus.OK)
  async getSeriesProgress(@Query('series_id') series_id?: string) {
    return this.reportService.getSeriesProgress(series_id);
  }

  @Get('payment-overview')
  @HttpCode(HttpStatus.OK)
  async getPaymentOverview(
    @Query('series_id') series_id?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportService.getPaymentOverview(series_id, Number(page), Number(limit));
  }

  @Get('enrollments')
  @HttpCode(HttpStatus.OK)
  async listEnrollments(
    @Query('series_id') series_id?: string,
    @Query('user_id') user_id?: string,
    @Query('status') status?: any,
    @Query('enroll_type') enroll_type?: any,
    @Query('payment_status') payment_status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportService.listEnrollments({
      series_id,
      user_id,
      status,
      enroll_type,
      payment_status,
      search,
      page: Number(page),
      limit: Number(limit),
    });
  }
}
