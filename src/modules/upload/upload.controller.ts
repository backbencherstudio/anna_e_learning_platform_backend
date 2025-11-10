import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Get, Param, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';
import { UploadService } from './upload.service';
import { ChunkUploadService } from './chunk-upload.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadChunkDto } from './dto/upload-chunk.dto';
import { MergeChunksDto } from './dto/merge-chunks.dto';
import { AbortChunkUploadDto } from './dto/abort-chunk-upload.dto';

@ApiTags('Upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/upload')
export class UploadController {
    constructor(
        private readonly uploadService: UploadService,
        private readonly chunkUploadService: ChunkUploadService,
    ) { }

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

    @Post('chunk')
    @HttpCode(HttpStatus.OK)
    @UseInterceptors(FileInterceptor('chunk'))
    async uploadChunk(
        @UploadedFile() chunk: Express.Multer.File,
        @Body() dto: UploadChunkDto,
    ) {
        return this.chunkUploadService.saveChunk(chunk, dto);
    }

    @Post('chunk/merge')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Merge all chunks and create or update lesson file record',
        description: 'If lessonFileId is provided, deletes old video files and updates the existing record. Otherwise, creates a new lesson file record.'
    })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['fileName', 'courseId', 'fileType', 'fileSize'],
            properties: {
                fileName: {
                    type: 'string',
                    description: 'Original file name',
                },
                courseId: {
                    type: 'string',
                    description: 'Course ID',
                },
                fileType: {
                    type: 'string',
                    description: 'File MIME type',
                },
                fileSize: {
                    type: 'number',
                    description: 'Total file size in bytes',
                },
                title: {
                    type: 'string',
                    description: 'Optional title for the lesson file',
                },
                lessonFileId: {
                    type: 'string',
                    description: 'Optional lesson file ID to update existing video. If provided, old files will be deleted and record will be updated.',
                },
            },
        },
    })
    async mergeChunks(@Body() dto: MergeChunksDto) {
        return this.chunkUploadService.mergeChunks(dto);
    }

    @Post('chunk/abort')
    @HttpCode(HttpStatus.OK)
    async abortChunkUpload(@Body() dto: AbortChunkUploadDto) {
        return this.chunkUploadService.abortChunkUpload(dto);
    }
}
