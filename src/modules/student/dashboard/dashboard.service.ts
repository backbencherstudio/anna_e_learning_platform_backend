import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);
    constructor(private readonly prisma: PrismaService) { }

    async getDashboard() {
        try {
            return {
                success: true,
                message: 'Dashboard retrieved successfully',
                data: null,
            }
        }
        catch (error) {
            this.logger.error(error);
            throw new Error(error);
        }
    }
}
