import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMaterialDto {
    @IsString()
    @IsNotEmpty()
    title!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    url?: string;

    @IsOptional()
    @IsString()
    @IsIn(['document', 'video', 'audio', 'image', 'link', 'other'])
    type?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    position?: number = 0;

    @IsOptional()
    @IsString()
    series_id?: string;

    @IsOptional()
    @IsString()
    course_id?: string;
}
