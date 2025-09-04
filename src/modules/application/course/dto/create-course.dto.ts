import { Transform, Type } from 'class-transformer';
import {
    IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min, ValidateNested, IsArray,
} from 'class-validator';
import { CourseVisibility } from '@prisma/client';
import { CreateModuleDto } from './create-module.dto';

export class CreateCourseDto {
    @IsString() @IsNotEmpty() @MaxLength(120)
    title!: string;

    @IsString() @MaxLength(140) @IsOptional()
    series_id?: string;

    @IsOptional() @IsString() @MaxLength(140)
    slug?: string;

    @IsOptional() @IsString() @MaxLength(280)
    summary?: string;

    @IsOptional() @IsString()
    description?: string;

    @IsOptional() @IsEnum(CourseVisibility)
    visibility?: CourseVisibility;

    @IsOptional() @IsString()
    duration?: string;

    @IsOptional() @IsDateString()
    start_date?: string;

    @IsOptional() @IsDateString()
    end_date?: string;

    @IsOptional()
    thumbnail?: Express.Multer.File;

    @IsOptional()
    @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
    price?: number;

    @IsOptional() @IsString()
    code_type?: string;

    @IsOptional() @IsString()
    course_type?: string;

    @IsOptional() @IsString()
    note?: string;

    @IsOptional()
    @IsArray()
    @Transform(({ value }) => {
        if (typeof value === 'string') {
            // Parse the answers if it's a stringified array
            try {
                return JSON.parse(value);  // Parse the JSON string into an array
            } catch (error) {
                throw new Error('Invalid format for answers');  // Throw error if parsing fails
            }
        }
        return value;  // Return the original value if it's already an array
    })
    modules?: CreateModuleDto[];
}
