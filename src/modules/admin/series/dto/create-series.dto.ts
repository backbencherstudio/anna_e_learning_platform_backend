import { Transform, Type } from 'class-transformer';
import {
    IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min, ValidateNested, IsArray,

} from 'class-validator';
import { CreateCourseDto } from './create-course.dto';

export class CreateSeriesDto {
    @IsString() @IsNotEmpty() @MaxLength(120)
    title!: string;

    @IsOptional() @IsString() @MaxLength(140)
    slug?: string;

    @IsOptional() @IsString() @MaxLength(280)
    summary?: string;

    @IsOptional() @IsString()
    description?: string;

    @IsString()
    @IsOptional()
    visibility?: string;

    @IsOptional() @IsString()
    duration?: string;

    @IsOptional() @IsString()
    video_length?: string;

    @IsOptional() @IsDateString()
    start_date?: string;

    @IsOptional() @IsDateString()
    end_date?: string;

    @IsOptional()
    thumbnail?: Express.Multer.File;

    @IsOptional()
    @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
    total_price?: number;

    @IsOptional() @IsString()
    course_type?: string;

    @IsOptional() @IsString()
    note?: string;

    @IsOptional() @Transform(({ value }) => value === undefined ? 0 : Number(value))
    available_site?: number;


    @IsOptional() @Transform(({ value }) => value === undefined ? 0 : Number(value))
    total_site?: number;

    @IsOptional() @IsString()
    language?: string;

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
    courses?: CreateCourseDto[];
}
