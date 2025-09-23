import { ArrayNotEmpty, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitQuizAnswerDto {
    @IsString()
    question_id: string;

    @IsOptional()
    @IsString()
    answer_id?: string; // selected option id for MCQ

    @IsOptional()
    @IsString()
    answer_text?: string; // for text questions
}

export class SubmitQuizDto {
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => SubmitQuizAnswerDto)
    answers: SubmitQuizAnswerDto[];
}


