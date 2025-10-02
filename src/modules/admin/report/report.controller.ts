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
  async getSeriesProgress( @Query('series_id') series_id?: string) {
    return this.reportService.getSeriesProgress(series_id);
  }
}
