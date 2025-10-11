import { Controller, Get, UseGuards, Req, Param } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';


@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@Controller('student/certificate')
export class CertificateController {
  constructor(private readonly certificateService: CertificateService) { }

  @Get('course-progress')
  @ApiOperation({ summary: 'Get course progress data for certificates' })
  async getCourseProgress(@Req() req: any) {
    const userId = req.user.userId;
    return this.certificateService.getCourseProgress(userId);
  }

  @Get('data/:courseId')
  @ApiOperation({ summary: 'Get certificate data for completed course' })
  async getCertificateData(
    @Req() req: any,
    @Param('courseId') courseId: string
  ) {
    const userId = req.user.userId;
    return this.certificateService.getCertificateData(userId, courseId);
  }

  @Get('diploma/:seriesId')
  @ApiOperation({ summary: 'Get diploma data for completed series' })
  async getDiplomaData(
    @Req() req: any,
    @Param('seriesId') seriesId: string
  ) {
    const userId = req.user.userId;
    return this.certificateService.getDiplomaData(userId, seriesId);
  }
}
