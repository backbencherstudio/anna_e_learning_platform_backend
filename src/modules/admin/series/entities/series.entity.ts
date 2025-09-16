export class Series {
    id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;

    title: string;
    slug: string;
    summary?: string;
    description?: string;
    visibility?: string;
    duration?: string;
    start_date?: Date;
    end_date?: Date;
    thumbnail?: string;
    total_price?: number;
    course_type?: string;
    note?: string;
    available_site?: number;

    language_id: string;
    language?: any;

    // Relations
    courses?: any[];
    quizzes?: any[];
    assignments?: any[];
    enrollments?: any[];
    user_progress?: any[];
    certificates?: any[];
}
