import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTeacherSectionDto {
    @IsString()
    @IsNotEmpty()
    section_type!: string; // e.g., video, article, quiz

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
