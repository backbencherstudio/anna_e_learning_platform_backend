import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CardGeneratorService } from './card-generator.service';
import { CreateCardGeneratorDto } from './dto/create-card-generator.dto';
import { UpdateCardGeneratorDto } from './dto/update-card-generator.dto';
import { CardGeneratorResponse } from './interfaces/card-generator-response.interface';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Role } from 'src/common/guard/role/role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/card-generator')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CardGeneratorController {
  constructor(private readonly cardGeneratorService: CardGeneratorService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Body() createCardGeneratorDto: CreateCardGeneratorDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<CardGeneratorResponse<any>> {
    return this.cardGeneratorService.create(createCardGeneratorDto, file);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('student_id') student_id?: string,
  ): Promise<CardGeneratorResponse<{ cardGenerators: any[]; pagination: any }>> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    return this.cardGeneratorService.findAll(pageNum, limitNum, search, student_id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string): Promise<CardGeneratorResponse<any>> {
    return this.cardGeneratorService.findOne(id);
  }



  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image'))
  async update(
    @Param('id') id: string,
    @Body() updateCardGeneratorDto: UpdateCardGeneratorDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<CardGeneratorResponse<any>> {
    return this.cardGeneratorService.update(id, updateCardGeneratorDto, file);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string): Promise<CardGeneratorResponse<null>> {
    return this.cardGeneratorService.remove(id);
  }
}
