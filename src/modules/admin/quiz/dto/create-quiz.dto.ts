import { Transform, Type } from 'class-transformer';
import {
    IsString, IsNotEmpty, IsOptional, IsInt, IsBoolean, IsDateString, IsArray, ValidateNested, Min, MaxLength,
} from 'class-validator';

export class CreateQuestionAnswerDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    option!: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    position?: number;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    is_correct?: boolean;
}

export class CreateQuizQuestionDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    prompt!: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    points?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    position?: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateQuestionAnswerDto)
    answers!: CreateQuestionAnswerDto[];
}

export class CreateQuizDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    instructions?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
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
    metadata?: any;

    @IsOptional()
    @IsString()
    course_id?: string;

    @IsOptional()
    @IsString()
    lesson_id?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateQuizQuestionDto)
    questions!: CreateQuizQuestionDto[];
}
