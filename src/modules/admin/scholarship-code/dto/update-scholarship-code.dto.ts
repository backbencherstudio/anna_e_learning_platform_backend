import { PartialType } from '@nestjs/swagger';
import { CreateScholarshipCodeDto } from './create-scholarship-code.dto';

export class UpdateScholarshipCodeDto extends PartialType(CreateScholarshipCodeDto) {}
