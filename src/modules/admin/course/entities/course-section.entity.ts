export class CourseSection {
    id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;

    course_id: string;
    course?: any;

    title: string;
    position: number;

    lessons?: any[];
}
