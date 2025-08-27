export interface AssignmentResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}
