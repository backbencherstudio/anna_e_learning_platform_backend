export interface SeriesResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}
