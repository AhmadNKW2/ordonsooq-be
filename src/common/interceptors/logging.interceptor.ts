import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const userAgent = request.get('user-agent') || '';
    const { ip, method, path: url } = request;
    const now = Date.now();

    return next
      .handle()
      .pipe(
        tap(() => {
          const response = ctx.getResponse();
          const delay = Date.now() - now;
          const statusCode = response.statusCode;
          
          this.logger.log(
            `${method} ${url} ${statusCode} - ${delay}ms - ${userAgent} ${ip}`
          );
        }),
      );
  }
}
