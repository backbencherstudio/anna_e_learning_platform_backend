import { Controller, Get, Param, Query, HttpStatus, HttpCode, UseGuards } from '@nestjs/common';
import { QuizSubmissionService } from './quiz-submission.service';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Role } from 'src/common/guard/role/role.enum';


@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/quiz-submission')
export class QuizSubmissionController {
  constructor(private readonly quizSubmissionService: QuizSubmissionService) { }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('quiz_id') quiz_id?: string,
    @Query('student_id') student_id?: string,
    @Query('status') status?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.quizSubmissionService.findAll(pageNum, limitNum, search, quiz_id, student_id, status);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id') id: string) {
    return this.quizSubmissionService.findOne(id);
  }
}
