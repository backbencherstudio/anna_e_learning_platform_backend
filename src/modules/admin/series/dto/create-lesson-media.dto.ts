import { IsOptional, IsString, IsEnum, MaxLength, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum LessonMediaKind {
    IMAGE = 'image',
    VIDEO = 'video',
    PDF = 'pdf',
    SLIDES = 'slides',
}

export class CreateLessonMediaDto {
    @IsString()
    url!: string;

    @IsOptional()
    @IsEnum(LessonMediaKind)
    kind?: LessonMediaKind;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    alt?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    position?: number;

    @IsOptional()
    @IsString()
    video_length?: string;

    @IsOptional()
    is_locked?: boolean;
}


