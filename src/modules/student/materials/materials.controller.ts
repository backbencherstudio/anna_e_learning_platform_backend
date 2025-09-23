import { Controller, Get, Param, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseGuards, Request } from '@nestjs/common';
import { MaterialsService } from './materials.service';
import { MaterialsResponse } from './interfaces/materials-response.interface';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';


@Controller('student/materials')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) { }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('series_id') series_id?: string,
    @Query('course_id') course_id?: string,
    @Query('lecture_type') lecture_type?: string,
  ): Promise<MaterialsResponse<{ materials: any[]; pagination: any }>> {
    const userId = req.user.id;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    return this.materialsService.findAll(userId, pageNum, limitNum, search, series_id, course_id, lecture_type);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<MaterialsResponse<any>> {
    const userId = req.user.id;
    return this.materialsService.findOne(userId, id);
  }
}