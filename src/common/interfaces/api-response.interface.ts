export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
  message?: string;
  time: string;
}

export interface ApiError {
  success: false;
  error: {
    code: number;
    message: string;
    details?: Array<{
      field: string;
      message: string;
    }>;
  };
  time: string;
}
