export interface SeriesResponse<T> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}