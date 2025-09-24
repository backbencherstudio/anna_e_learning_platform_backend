import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpStatus, HttpCode, UseGuards, Req, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) { }

  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('course_id') course_id?: string,
    @Query('week_number') week_number?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.feedbackService.findAll(pageNum, limitNum, search, course_id, week_number, type, status);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.feedbackService.findOne( id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  update(@Req() req: any, @Param('id') id: string, @Body() updateFeedbackDto: UpdateFeedbackDto, @UploadedFile() file?: Express.Multer.File) {
    return this.feedbackService.update( id, updateFeedbackDto, file);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId || req.user?.id;
    return this.feedbackService.remove(userId, id);
  }

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id') id: string) {
    return this.feedbackService.approve(id);
  }
}
