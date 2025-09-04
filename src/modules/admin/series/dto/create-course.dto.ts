import { IsString, IsNotEmpty, IsOptional, IsInt, Min, MaxLength, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateLessonFileDto } from './create-lesson-file.dto';

export class CreateCourseDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    title!: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    position?: number;

    @IsOptional()
    @IsString()
    intro_video_url?: string;

    @IsOptional()
    @IsString()
    end_video_url?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateLessonFileDto)
    lessons_files?: CreateLessonFileDto[];
}
