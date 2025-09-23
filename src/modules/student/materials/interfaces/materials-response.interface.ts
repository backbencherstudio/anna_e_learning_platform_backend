export interface MaterialsResponse<T> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}
