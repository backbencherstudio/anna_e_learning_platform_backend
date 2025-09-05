import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
  HttpStatus,
  HttpCode,
  HttpException,
} from '@nestjs/common';
import { LanguageService } from './language.service';
import { CreateLanguageDto } from './dto/create-language.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Language')
@Controller('admin/language')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class LanguageController {
  constructor(private readonly languageService: LanguageService) { }

  @Post()
  async create(
    @Body() createLanguageDto: CreateLanguageDto,
  ) {
    return await this.languageService.create(createLanguageDto);
  }

  @Get()
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return await this.languageService.findAll(pageNum, limitNum, search);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.languageService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateLanguageDto: UpdateLanguageDto,
  ) {
    return await this.languageService.update(id, updateLanguageDto);
  }

  @ApiOperation({ summary: 'Delete a language' })
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.languageService.remove(id);
  }
}
