import { IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateScholarshipCodeDto {
    @IsOptional()
    @IsString()
    @MaxLength(50)
    code?: string;

    @IsOptional()
    @IsString()
    code_type?: string; // 'code' | 'percentage'

    @IsOptional()
    @IsString()
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    scholarship_type?: string; // e.g. 'free_student'

    @IsOptional()
    @IsInt()
    status?: number;

    @IsOptional()
    @IsString()
    student_id?: string;

    @IsOptional()
    @IsString()
    series_id?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    course_ids?: string[];
}
