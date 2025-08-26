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
    estimated_min?: number;
    start_date?: Date;
    end_date?: Date;
    thumbnail?: string;
    metadata?: any;
    price?: number;

    language_id?: string;
    language?: any;

    sections?: any[];
    lessons?: any[];
    media?: any[];
    quizzes?: any[];
    assignments?: any[];
    enrollments?: any[];
    user_progress?: any[];
    certificates?: any[];
}
