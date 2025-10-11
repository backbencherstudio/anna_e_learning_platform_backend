import { Controller, Post, Body, HttpCode, HttpStatus, UsePipes, ValidationPipe, UseGuards, Req, Get, Param, Query, Delete } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';


@UseGuards(JwtAuthGuard)
@Controller('student/enrollment')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) { }


  @Post()
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: CreateEnrollmentDto,
    @Req() req: any,
  ) {
    const user_id = req.user.userId;
    return this.enrollmentService.create(body, user_id);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getStudentEnrollments(@Req() req: any) {
    const user_id = req.user.userId;
    return this.enrollmentService.getStudentEnrollments(user_id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteEnrollment(
    @Param('id') enrollmentId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.enrollmentService.deleteEnrollment(enrollmentId, userId);
  }
}
