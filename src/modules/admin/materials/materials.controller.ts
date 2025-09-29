import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { MaterialsResponse } from './interfaces/materials-response.interface';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Role } from 'src/common/guard/role/role.enum';


@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/materials')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @Body() createMaterialDto: CreateMaterialDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<MaterialsResponse<any>> {
    return this.materialsService.create(createMaterialDto, file);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('series_id') series_id?: string,
    @Query('course_id') course_id?: string,
    @Query('type') type?: string,
    @Query('lecture_type') lecture_type?: string,
  ): Promise<MaterialsResponse<{ materials: any[]; pagination: any }>> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    return this.materialsService.findAll(pageNum, limitNum, search, series_id, course_id, type, lecture_type);
  }

  @Get('series/:series_id')
  @HttpCode(HttpStatus.OK)
  async findBySeries(@Param('series_id') series_id: string): Promise<MaterialsResponse<any[]>> {
    return this.materialsService.findBySeries(series_id);
  }

  @Get('course/:course_id')
  @HttpCode(HttpStatus.OK)
  async findByCourse(@Param('course_id') course_id: string): Promise<MaterialsResponse<any[]>> {
    return this.materialsService.findByCourse(course_id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string): Promise<MaterialsResponse<any>> {
    return this.materialsService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @Param('id') id: string,
    @Body() updateMaterialDto: UpdateMaterialDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<MaterialsResponse<any>> {
    return this.materialsService.update(id, updateMaterialDto, file);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string): Promise<MaterialsResponse<null>> {
    return this.materialsService.remove(id);
  }
}
