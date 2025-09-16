import { PartialType } from '@nestjs/mapped-types';
import { CreateQuizSubmissionDto } from './create-quiz-submission.dto';

export class UpdateQuizSubmissionDto extends PartialType(CreateQuizSubmissionDto) { }
