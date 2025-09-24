import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateFeedbackDto {
    @IsString()
    course_id: string;

    @IsOptional()
    @IsString()
    week_number?: string;

    @IsOptional()
    @IsString()
    type?: string; // e.g., course_review, issue, suggestion

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    status?: string; // pending, resolved, etc.

    @IsOptional()
    @IsString()
    file_url?: string; // stored path relative to storage root
}

