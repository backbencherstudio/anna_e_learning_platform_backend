import { PartialType } from '@nestjs/mapped-types';
import { CreateCardGeneratorDto } from './create-card-generator.dto';

export class UpdateCardGeneratorDto extends PartialType(CreateCardGeneratorDto) { }
