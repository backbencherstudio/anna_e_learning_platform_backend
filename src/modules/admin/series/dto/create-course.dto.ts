import { IsString, IsNotEmpty, IsOptional, IsInt, Min, MaxLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateCourseDto {

    @IsOptional()
    @IsString()
    series_id?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    title!: string;


    @IsOptional()
    @Transform(({ value }) => value === undefined ? undefined : Number(value))
    @Type(() => Number)
    @IsInt()
    @Min(0)
    price?: number;

    @IsOptional()
    @IsString()
    intro_video_url?: string;

    @IsOptional()
    @IsString()
    end_video_url?: string;

}
