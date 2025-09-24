import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseGuards } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { DashboardQueryDto } from './dto/dashboard.dto';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Role } from 'src/common/guard/role/role.enum';


@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/quiz')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class QuizController {
  constructor(private readonly quizService: QuizService) { }


  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  async getDashboard(
    @Query('series_id') series_id?: string,
    @Query('course_id') course_id?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.quizService.getDashboard({
      series_id,
      course_id,
      limit: limitNum,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createQuizDto: CreateQuizDto) {
    return this.quizService.create(createQuizDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.quizService.findAll(pageNum, limitNum, search);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    return this.quizService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() updateQuizDto: UpdateQuizDto) {
    return this.quizService.update(id, updateQuizDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return this.quizService.remove(id);
  }

  @Get(':id/publication-status')
  @HttpCode(HttpStatus.OK)
  async getPublicationStatus(@Param('id') id: string) {
    return this.quizService.getQuizPublicationStatus(id);
  }

  @Patch(':id/cancel-publication')
  @HttpCode(HttpStatus.OK)
  async cancelScheduledPublication(@Param('id') id: string) {
    return this.quizService.cancelScheduledPublication(id);
  }
}
