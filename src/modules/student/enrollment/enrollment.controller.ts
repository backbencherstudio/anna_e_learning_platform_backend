import { Controller, Post, Body, HttpCode, HttpStatus, UsePipes, ValidationPipe, UseGuards, Req } from '@nestjs/common';
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
}
