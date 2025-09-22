import { IsString, IsNotEmpty, IsOptional, IsInt, Min, MaxLength, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';


export class CreateLessonFileDto {

    @IsOptional()
    @IsString()
    @MaxLength(200)
    title?: string;

    @IsString()
    @IsOptional()
    url?: string;

    @IsString()
    @IsOptional()
    doc?: string;

    @IsOptional()
    @IsString()
    kind?: string;

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
    course_id?: string;
}
