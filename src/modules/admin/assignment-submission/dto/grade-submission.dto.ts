import { IsArray, IsString, IsNumber, IsOptional, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GradeAnswerDto {
    @IsString()
    question_id: string;

    @IsNumber()
    @Min(0)
    marks_awarded: number;

    @IsOptional()
    @IsString()
    feedback?: string;
}

export class GradeSubmissionDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => GradeAnswerDto)
    answers: GradeAnswerDto[];

    @IsOptional()
    @IsString()
    overall_feedback?: string;
}
