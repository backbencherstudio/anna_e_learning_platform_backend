export enum LessonFileKind {
    IMAGE = 'image',
    VIDEO = 'video',
    PDF = 'pdf',
    SLIDES = 'slides'
}

export class LessonFile {
    id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;

    url: string;
    kind: LessonFileKind;
    alt?: string;
    position: number;

    course_id?: string;
    course?: any;

    module_id?: string;
    module?: any;
}
