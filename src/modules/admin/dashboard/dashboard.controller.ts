import { Controller, Get, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) { }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getDashboard(
    @Query('date') date?: string,
  ) {
    return this.dashboardService.getDashboard(date);
  }
}
