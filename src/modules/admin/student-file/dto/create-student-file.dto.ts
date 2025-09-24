import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStudentFileDto {
    @IsOptional()
    @IsString()
    @IsIn(['document', 'video', 'audio', 'image', 'link', 'other'])
    type?: string;

    @IsOptional()
    @IsString()
    url?: string;

    @IsOptional()
    @IsString()
    @IsIn(['image', 'video', 'pdf', 'slides', 'document', 'other'])
    kind?: string;

    @IsOptional()
    @IsString()
    alt?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    week_number?: number;

    @IsString()
    @IsNotEmpty()
    section_type!: string;

    @IsString()
    @IsNotEmpty()
    series_id!: string;

    @IsString()
    @IsNotEmpty()
    course_id!: string;
}