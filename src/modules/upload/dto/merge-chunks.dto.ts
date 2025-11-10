import { IsString, IsNumber, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class MergeChunksDto {
    @IsString()
    @IsNotEmpty()
    fileName: string;

    @IsString()
    @IsNotEmpty()
    courseId: string;

    @IsString()
    @IsNotEmpty()
    fileType: string;

    @IsNumber()
    @Type(() => Number)
    @IsNotEmpty()
    @Min(1)
    fileSize: number;

    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    lessonFileId?: string;
}

