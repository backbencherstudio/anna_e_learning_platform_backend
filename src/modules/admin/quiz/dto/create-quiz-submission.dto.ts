import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsInt, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuizSubmissionAnswerDto {
    @IsString()
    @IsNotEmpty()
    question_id!: string;

    @IsOptional()
    @IsString()
    answer_id?: string; // For multiple choice questions

    @IsOptional()
    @IsString()
    answer_text?: string; // For text-based answers

    @IsOptional()
    @IsString()
    feedback?: string;
}

export class CreateQuizSubmissionDto {
    @IsString()
    @IsNotEmpty()
    quiz_id!: string;

    @IsOptional()
    @IsInt()
    time_taken?: number; // Time taken in seconds

    @IsOptional()
    metadata?: any; // Additional data like time limits, attempts allowed, etc.

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateQuizSubmissionAnswerDto)
    answers!: CreateQuizSubmissionAnswerDto[];
}

export class SubmitQuizDto {
    @IsString()
    @IsNotEmpty()
    submission_id!: string;

    @IsOptional()
    @IsInt()
    time_taken?: number;
}
