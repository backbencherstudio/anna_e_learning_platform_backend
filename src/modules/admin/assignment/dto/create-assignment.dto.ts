import { Transform, Type } from 'class-transformer';
import {
    IsString, IsNotEmpty, IsOptional, IsInt, IsBoolean, IsDateString, IsArray, ValidateNested, Min, MaxLength,
} from 'class-validator';

export class CreateAssignmentQuestionDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    title!: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Transform(({ value }) => value === undefined ? 0 : Number(value))
    points?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    position?: number;
}

export class CreateAssignmentDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Transform(({ value }) => value === undefined ? undefined : Number(value))
    total_marks?: number;

    @IsOptional()
    @IsDateString()
    due_at?: string;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    is_published?: boolean;

    @IsOptional()
    @IsDateString()
    published_at?: string;

    @IsOptional()
    @IsString()
    series_id?: string;

    @IsOptional()
    @IsString()
    course_id?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateAssignmentQuestionDto)
    questions!: CreateAssignmentQuestionDto[];
}
