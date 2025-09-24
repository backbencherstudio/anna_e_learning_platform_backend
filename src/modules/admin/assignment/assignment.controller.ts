import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseGuards } from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Role } from 'src/common/guard/role/role.enum';


@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/assignment')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createAssignmentDto: CreateAssignmentDto) {
    return this.assignmentService.create(createAssignmentDto);
  }

  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  async getDashboard(
    @Query('series_id') series_id?: string,
    @Query('course_id') course_id?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.assignmentService.getDashboard({
      series_id,
      course_id,
      limit: limitNum,
    });
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
    return this.assignmentService.findAll(pageNum, limitNum, search);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    return this.assignmentService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() updateAssignmentDto: UpdateAssignmentDto) {
    return this.assignmentService.update(id, updateAssignmentDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return this.assignmentService.remove(id);
  }

  @Get(':id/publication-status')
  @HttpCode(HttpStatus.OK)
  async getPublicationStatus(@Param('id') id: string) {
    return this.assignmentService.getAssignmentPublicationStatus(id);
  }

  @Patch(':id/cancel-publication')
  @HttpCode(HttpStatus.OK)
  async cancelScheduledPublication(@Param('id') id: string) {
    return this.assignmentService.cancelScheduledPublication(id);
  }
}
