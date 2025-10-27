import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { VideoDurationService } from '../../common/lib/video-duration/video-duration.service';

@Module({
    imports: [PrismaModule],
    controllers: [UploadController],
    providers: [UploadService, VideoDurationService],
    exports: [UploadService],
})
export class UploadModule { }
