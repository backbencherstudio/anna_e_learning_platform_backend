export class Module {
    id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;

    course_id: string;
    course?: any;

    title: string;
    position: number;
    intro_video_url?: string;
    end_video_url?: string;

    lesson_files?: any[];
    quizzes?: any[];
    assignments?: any[];
}
