import { IsOptional, IsString, IsDateString, IsInt, IsBoolean } from 'class-validator';

export class DashboardAssignmentDto {
    id: string;
    title: string;
    submission_count: number;
    total_students: number;
    due_date?: Date;
    created_at: Date;
    series?: {
        id: string;
        title: string;
    };
    course?: {
        id: string;
        title: string;
    };
}

export class DashboardQuizDto {
    id: string;
    title: string;
    due_at?: Date;
    published_at?: Date;
    is_published: boolean;
    created_at: Date;
    series?: {
        id: string;
        title: string;
    };
    course?: {
        id: string;
        title: string;
    };
}

export class DashboardResponseDto {
    assignments: DashboardAssignmentDto[];
    published_quizzes: DashboardQuizDto[];
    unpublished_quizzes: DashboardQuizDto[];
    total_assignments: number;
    total_published_quizzes: number;
    total_unpublished_quizzes: number;
}

export class DashboardQueryDto {
    @IsOptional()
    @IsString()
    series_id?: string;

    @IsOptional()
    @IsString()
    course_id?: string;

    @IsOptional()
    @IsInt()
    limit?: number = 10;
}
