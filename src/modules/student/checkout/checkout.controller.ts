import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
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

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getOne(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.userId;
    return this.checkoutService.getOne(userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.userId;
    return this.checkoutService.remove(userId, id);
  }
}
