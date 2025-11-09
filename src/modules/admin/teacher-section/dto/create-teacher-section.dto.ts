import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsIn, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { SectionType } from '@prisma/client';

export class CreateTeacherSectionDto {
    @IsEnum(SectionType)
    @IsNotEmpty()
    section_type!: SectionType;

    @IsOptional()
    @IsString()
    category?: string;

    @IsString()
    @IsNotEmpty()
    title!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    duration?: string; // e.g., "10m"

    @IsOptional()
    @IsString()
    release_date?: string; // ISO string; parsed in service

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    position?: number = 0;

    @IsOptional()
    @IsString()
    @IsIn(['published', 'scheduled', 'released', 'archived'])
    status?: string = 'published';
}
