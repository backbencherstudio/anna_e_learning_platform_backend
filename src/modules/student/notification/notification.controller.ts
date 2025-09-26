import { Controller, Get, Delete, Param, Req, UseGuards, Patch } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guard/role/roles.guard';
import { Roles } from '../../../common/guard/role/roles.decorator';
import { Role } from '../../../common/guard/role/role.enum';

@Controller('student/notification')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class NotificationController {
    constructor(private readonly notificationService: NotificationService) { }

    @Get()
    findAll(@Req() req) {
        return this.notificationService.findAll(req.user.userId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        return this.notificationService.remove(id, req.user.userId);
    }

    @Delete()
    removeAll(@Req() req) {
        return this.notificationService.removeAll(req.user.userId);
    }

    @Patch(':id/read')
    markAsRead(@Param('id') id: string, @Req() req) {
        return this.notificationService.markAsRead(id, req.user.userId);
    }

    @Patch('read-all')
    markAllAsRead(@Req() req) {
        return this.notificationService.markAllAsRead(req.user.userId);
    }
}
