import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';

// Matches UTC ISO strings like "2026-03-04T08:42:15.655Z"
const UTC_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3

function toUtcPlus6(value: unknown): unknown {
  if (typeof value === 'string' && UTC_ISO_RE.test(value)) {
    const shifted = new Date(new Date(value).getTime() + OFFSET_MS);
    return shifted.toISOString().replace('Z', '+03:00');
  }
  if (value instanceof Date) {
    const shifted = new Date(value.getTime() + OFFSET_MS);
    return shifted.toISOString().replace('Z', '+03:00');
  }
  if (Array.isArray(value)) {
    return value.map(toUtcPlus6);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as object)) {
      result[key] = toUtcPlus6((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const now = toUtcPlus6(new Date()) as string;

    return next.handle().pipe(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map((data): any => {
        // If data already has the response structure, return it
        if (data && typeof data === 'object' && 'success' in data) {
          return {
            ...(toUtcPlus6(data) as ApiResponse<T>),
            time: now,
          };
        }

        // Check if data has meta (pagination)
        if (
          data &&
          typeof data === 'object' &&
          'data' in data &&
          'meta' in data
        ) {
          return {
            success: true,
            data: toUtcPlus6(data.data),
            meta: toUtcPlus6(data.meta),
            message: data.message || 'Success',
            time: now,
          };
        }

        // Default response
        return {
          success: true,
          data: toUtcPlus6(data),
          message: 'Success',
          time: now,
        };
      }),
    );
  }
}
