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
    @ApiOperation({ summary: 'Upload a chunk of a large file' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                chunk: {
                    type: 'string',
                    format: 'binary',
                },
                index: {
                    type: 'number',
                    description: 'Chunk index (0-based)',
                },
                totalChunks: {
                    type: 'number',
                    description: 'Total number of chunks',
                },
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
            },
        },
    })
    @ApiResponse({ status: 200, description: 'Chunk uploaded successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request data' })
    async uploadChunk(
        @UploadedFile() chunk: Express.Multer.File,
        @Body() dto: UploadChunkDto,
    ) {
        return this.chunkUploadService.saveChunk(chunk, dto);
    }

    @Post('chunk/merge')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Merge all chunks and create lesson file record' })
    @ApiResponse({ status: 200, description: 'Chunks merged successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request data' })
    async mergeChunks(@Body() dto: MergeChunksDto) {
        return this.chunkUploadService.mergeChunks(dto);
    }

    @Post('chunk/abort')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Abort chunk upload and cleanup' })
    @ApiResponse({ status: 200, description: 'Chunks cleaned up successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request data' })
    async abortChunkUpload(@Body() dto: AbortChunkUploadDto) {
        return this.chunkUploadService.abortChunkUpload(dto);
    }
}
