import { ArrayNotEmpty, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitAnswerItemDto {
    @IsString()
    question_id: string;

    @IsOptional()
    @IsString()
    answer_text?: string;
}

export class SubmitAssignmentDto {
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => SubmitAnswerItemDto)
    answers: SubmitAnswerItemDto[];
}


