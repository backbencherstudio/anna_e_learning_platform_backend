import { PartialType } from '@nestjs/swagger';
import { CreateStudentFileDto } from './create-student-file.dto';

export class UpdateStudentFileDto extends PartialType(CreateStudentFileDto) { }