import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

@Controller('student/checkout')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: { series_id: string },
    @Req() req: any,
  ) {
    const userId = req.user?.userId; // support both shapes
    return this.checkoutService.create(userId, body.series_id);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@Req() req: any) {
    const userId = req.user?.userId;
    return this.checkoutService.list(userId);
  }

  @Get('series')
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('type') type?: string,
  ) {
    const userId = req.user?.userId;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.checkoutService.findAll(pageNum, limitNum, search, type, userId);
  }

  @Get(':id/series-summary')
  @HttpCode(HttpStatus.OK)
  async findSummary(@Param('id') id: string) {
    return this.checkoutService.findSummary(id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getOne(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.userId;
    return this.checkoutService.getOne(userId, id);
  }

  @Post('apply-code')
  @HttpCode(HttpStatus.OK)
  async applyCode(
    @Body() body: { checkout_id: string; code: string },
    @Req() req: any,
  ) {
    const userId = req.user?.userId;
    return this.checkoutService.applyCode(userId, body.checkout_id, body.code);
  }


  @Get(':id/applied-code')
  @HttpCode(HttpStatus.OK)
  async getAppliedCode(
    @Param('id') checkoutId: string,
    @Req() req: any,
    @Query('code') code?: string,
  ) {
    const userId = req.user?.userId;
    return this.checkoutService.getAppliedCode(userId, checkoutId, code);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.userId;
    return this.checkoutService.remove(userId, id);
  }
}
