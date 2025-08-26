import { IsNotEmpty, IsOptional, IsString, IsInt, Min, MaxLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateCourseSectionDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    title!: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    position?: number;
}
