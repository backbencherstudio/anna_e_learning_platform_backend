import { IsString, IsNotEmpty, IsOptional, IsInt, Min, MaxLength, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum LessonFileKind {
    IMAGE = 'image',
    VIDEO = 'video',
    PDF = 'pdf',
    SLIDES = 'slides'
}

export class CreateLessonFileDto {
    @IsString()
    @IsNotEmpty()
    url!: string;

    @IsOptional()
    @IsEnum(LessonFileKind)
    kind?: LessonFileKind;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    alt?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    position?: number;

    @IsOptional()
    @IsString()
    module_id?: string;
}
