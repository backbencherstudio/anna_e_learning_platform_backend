import { PartialType } from '@nestjs/swagger';
import { CreateTeacherSectionDto } from './create-teacher-section.dto';

export class UpdateTeacherSectionDto extends PartialType(CreateTeacherSectionDto) {}
