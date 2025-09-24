import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ScholarshipCodeService } from './scholarship-code.service';
import { CreateScholarshipCodeDto } from './dto/create-scholarship-code.dto';
import { UpdateScholarshipCodeDto } from './dto/update-scholarship-code.dto';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Role } from 'src/common/guard/role/role.enum';


@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/scholarship-code')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ScholarshipCodeController {
  constructor(private readonly scholarshipCodeService: ScholarshipCodeService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createScholarshipCodeDto: CreateScholarshipCodeDto) {
    return this.scholarshipCodeService.create(createScholarshipCodeDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.scholarshipCodeService.findAll(pageNum, limitNum, search);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id') id: string) {
    return this.scholarshipCodeService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(@Param('id') id: string, @Body() updateScholarshipCodeDto: UpdateScholarshipCodeDto) {
    return this.scholarshipCodeService.update(id, updateScholarshipCodeDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.scholarshipCodeService.remove(id);
  }
}
