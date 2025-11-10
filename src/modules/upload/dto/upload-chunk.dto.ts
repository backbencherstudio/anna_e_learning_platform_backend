import { IsString, IsNumber, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UploadChunkDto {
    @IsNumber()
    @Type(() => Number)
    @IsNotEmpty()
    @Min(0)
    index: number;

    @IsNumber()
    @Type(() => Number)
    @IsNotEmpty()
    @Min(1)
    totalChunks: number;

    @IsString()
    @IsNotEmpty()
    fileName: string;

    @IsString()
    @IsNotEmpty()
    courseId: string;

    @IsString()
    @IsNotEmpty()
    fileType: string;
}

