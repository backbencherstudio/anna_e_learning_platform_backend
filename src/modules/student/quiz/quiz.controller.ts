import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';
import { SubmitQuizDto } from './dto/submit-quiz.dto';


@Controller('student/quiz')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class QuizController {
  constructor(private readonly quizService: QuizService) { }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('series_id') series_id?: string,
    @Query('course_id') course_id?: string,
    @Query('submission_status') submission_status?: 'submitted' | 'not_submitted',
  ) {
    const userId = req.user?.userId;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.quizService.findAll(userId, pageNum, limitNum, search, series_id, course_id, submission_status);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId
    return this.quizService.findOne(userId, id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async submit(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SubmitQuizDto,
  ) {
    const userId = req.user?.userId
    return this.quizService.submit(userId, id, dto);
  }

  @Get(':id/submission')
  @HttpCode(HttpStatus.OK)
  async getSubmission(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId
    return this.quizService.getSubmission(userId, id);
  }
}
