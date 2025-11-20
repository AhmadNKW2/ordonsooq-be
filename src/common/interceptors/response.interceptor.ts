import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const now = new Date().toISOString();

    return next.handle().pipe(
      map((data) => {
        // If data already has the response structure, return it
        if (data && typeof data === 'object' && 'success' in data) {
          return {
            ...data,
            time: now,
          };
        }

        // Check if data has meta (pagination)
        if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
          return {
            success: true,
            data: data.data,
            meta: data.meta,
            message: data.message || 'Success',
            time: now,
          };
        }

        // Default response
        return {
          success: true,
          data,
          message: 'Success',
          time: now,
        };
      }),
    );
  }
}
