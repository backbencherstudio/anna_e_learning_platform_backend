import { Transform, Type } from 'class-transformer';
import {
    IsString, IsNotEmpty, IsOptional, IsBoolean, IsDateString, IsArray, ValidateNested, MaxLength,
} from 'class-validator';

export class CreateSeriesDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @IsOptional()
    thumbnail?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    course_ids?: string[];
}
