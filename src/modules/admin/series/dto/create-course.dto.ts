import { IsString, IsNotEmpty, IsOptional, IsInt, Min, MaxLength, ValidateNested, IsArray } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CreateLessonFileDto } from './create-lesson-file.dto';

export class CreateCourseDto {

    @IsOptional()
    @IsString()
    series_id?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    title!: string;

    @IsOptional()
    @Transform(({ value }) => value === undefined ? undefined : Number(value))
    @Min(0)
    position?: number;

    @IsOptional()
    @Transform(({ value }) => value === undefined ? undefined : Number(value))
    @Type(() => Number)
    @IsInt()
    @Min(0)
    price?: number;

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
