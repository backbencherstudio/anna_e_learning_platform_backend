import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Get, Param } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';
import { UploadService } from './upload.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/upload')
export class UploadController {
    constructor(private readonly uploadService: UploadService) { }

    @Post('presigned-url')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Generate presigned URL for direct MinIO upload' })
    @ApiResponse({ status: 200, description: 'Presigned URL generated successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request data' })
    async getPresignedUrl(@Body() body: {
        fileName: string;
        fileType: string;
        fileSize: number;
        courseId: string;
    }) {
        return this.uploadService.generatePresignedUrl(body);
    }

    @Post('complete-upload')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Complete upload and create lesson file record' })
    @ApiResponse({ status: 200, description: 'Upload completed successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request data' })
    async completeUpload(@Body() body: {
        key: string;
        fileName: string;
        courseId: string;
        fileSize: number;
        fileType?: string;
    }) {
        return this.uploadService.completeUpload(body);
    }

    @Get('test-connection')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Test MinIO connection' })
    @ApiResponse({ status: 200, description: 'MinIO connection test result' })
    async testConnection() {
        return this.uploadService.testMinIOConnection();
    }

    @Get('bucket-info')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Get MinIO bucket information' })
    @ApiResponse({ status: 200, description: 'Bucket information retrieved' })
    async getBucketInfo() {
        return this.uploadService.getBucketInfo();
    }
}
