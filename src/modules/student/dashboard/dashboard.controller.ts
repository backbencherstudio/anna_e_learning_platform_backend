import { Controller, Get, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';


@Controller('student/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) { }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getDashboard(@Req() req: any) {
    const userId = req.user.userId;
    return this.dashboardService.getDashboard(userId);
  }
}
