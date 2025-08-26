export interface CourseResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}
