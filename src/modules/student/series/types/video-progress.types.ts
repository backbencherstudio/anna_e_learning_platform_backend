export interface VideoProgressData {
    time_spent?: number;
    last_position?: number;
    completion_percentage?: number;
}

export interface VideoProgressResponse {
    success: boolean;
    message: string;
    data?: {
        progress: any;
        completion?: any;
        auto_completed: boolean;
    };
    error?: string;
}

export interface VideoValidationResult {
    isValid: boolean;
    courseProgress?: any;
    error?: string;
}

export interface CourseProgressData {
    course_id: string;
    user_id: string;
    series_id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'abandoned';
    completion_percentage: number;
    is_completed: boolean;
    started_at?: Date;
    completed_at?: Date;
}

export interface LessonUnlockResult {
    success: boolean;
    lesson_unlocked: boolean;
    next_course_started?: boolean;
    error?: string;
}
