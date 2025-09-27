export interface CardGeneratorResponse<T> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}
