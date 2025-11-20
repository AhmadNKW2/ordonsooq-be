import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiError } from '../interfaces/api-response.interface';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const now = new Date().toISOString();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: Array<{ field: string; message: string }> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || responseObj.error || message;

        // Handle validation errors
        if (Array.isArray(responseObj.message)) {
          details = responseObj.message.map((msg: any) => {
            if (typeof msg === 'string') {
              return { field: 'unknown', message: msg };
            }
            return {
              field: msg.property || msg.field || 'unknown',
              message: Object.values(msg.constraints || {}).join(', ') || msg.message || msg,
            };
          });
          message = 'Validation failed';
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorResponse: ApiError = {
      success: false,
      error: {
        code: status,
        message,
        ...(details && { details }),
      },
      time: now,
    };

    response.status(status).json(errorResponse);
  }
}
