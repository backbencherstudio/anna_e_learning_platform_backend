export interface LanguageResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}
