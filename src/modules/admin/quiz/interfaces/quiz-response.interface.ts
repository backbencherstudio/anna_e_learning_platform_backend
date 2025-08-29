export interface QuizResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}
