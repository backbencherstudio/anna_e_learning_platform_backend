import { IsNotEmpty, IsOptional, IsString, IsEnum, IsInt, Min, MaxLength, IsUrl } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { LessonType } from '@prisma/client';

export class CreateLessonDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    slug?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    section_id?: string;

    @IsOptional()
    @IsEnum(LessonType)
    type?: LessonType;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    duration_sec?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    position?: number;

    @IsOptional()
    media?: string[];

    @IsOptional()
    metadata?: any;
}
