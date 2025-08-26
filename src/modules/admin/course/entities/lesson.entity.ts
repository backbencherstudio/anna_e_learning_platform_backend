import { LessonType } from '@prisma/client';

export class Lesson {
    id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;

    course_id: string;
    section_id?: string;
    title: string;
    slug: string;
    type: LessonType;
    content?: any;
    duration_sec?: number;
    position: number;
    metadata?: any;

    course?: any;
    section?: any;

    media?: any[];
    quizzes?: any[];
    assignments?: any[];
    user_progress?: any[];
}
