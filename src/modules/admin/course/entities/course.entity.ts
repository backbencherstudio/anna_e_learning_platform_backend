import { CourseVisibility } from '@prisma/client';

export class Course {
    id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;

    title: string;
    slug: string;
    summary?: string;
    description?: string;
    visibility: CourseVisibility;
    duration?: string;
    start_date?: Date;
    end_date?: Date;
    thumbnail?: string;
    price?: number;
    code_type?: string;
    course_type?: string;
    note?: string;

    series_id?: string;
    series?: any;

    modules?: any[];
    quizzes?: any[];
    assignments?: any[];
    enrollments?: any[];
    user_progress?: any[];
    certificates?: any[];
    lesson_files?: any[];
}
