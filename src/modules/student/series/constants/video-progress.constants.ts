export const VIDEO_PROGRESS_CONSTANTS = {
    AUTO_COMPLETION_THRESHOLD: 100,
    INTRO_VIDEO_UNLOCK_THRESHOLD: 90, // Unlock first lesson at 90%
    MIN_VIEWED_THRESHOLD: 0,
    DEFAULT_COMPLETION_PERCENTAGE: 100,
} as const;

export const VIDEO_TYPES = {
    INTRO: 'intro',
    END: 'end',
    LESSON: 'lesson',
} as const;

export const COURSE_STATUS = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    ABANDONED: 'abandoned',
} as const;

export const ENROLLMENT_STATUS = {
    ACTIVE: 'ACTIVE',
    COMPLETED: 'COMPLETED',
} as const;

export const ERROR_MESSAGES = {
    COURSE_NOT_FOUND: 'You must be enrolled in this course',
    INTRO_VIDEO_NOT_UNLOCKED: 'Intro video is not unlocked yet',
    END_VIDEO_NOT_UNLOCKED: 'End video is not unlocked yet',
    COURSE_NOT_COMPLETED: 'You must complete the course before accessing the end video',
    LESSON_NOT_UNLOCKED: 'This lesson is not unlocked yet',
    LESSON_NOT_VIEWED: 'You must view the lesson before marking it as completed',
    SERIES_NOT_ENROLLED: 'You must be enrolled in this series',
} as const;

export const SUCCESS_MESSAGES = {
    INTRO_VIDEO_PROGRESS_UPDATED: 'Intro video progress updated successfully',
    END_VIDEO_PROGRESS_UPDATED: 'End video progress updated successfully',
    INTRO_VIDEO_COMPLETED: 'Intro video marked as completed and first lesson unlocked',
    END_VIDEO_COMPLETED: 'End video marked as completed and next lesson unlocked',
    LESSON_UNLOCKED: 'Lesson unlocked successfully',
    COURSE_PROGRESS_UPDATED: 'Course progress updated successfully',
} as const;
