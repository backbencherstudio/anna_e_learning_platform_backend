export interface StudentFileResponse<T> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}
