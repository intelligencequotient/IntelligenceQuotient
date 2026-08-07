import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

/**
 * Consistent error envelope, matching the main API.
 *
 * Deliberate `HttpException`s describe themselves to the caller. Anything else
 * is logged with a correlation id and answered generically — a raw Postgres or
 * PostgREST message names tables, columns and constraints, which is a free map
 * of the schema for whoever provoked it.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string' ? body : (body as any).message || exception.message;

      this.logger.warn(`${request.method} ${request.url} → ${status}`);
      response.status(status).json({
        statusCode: status,
        message: Array.isArray(message) ? message : [message],
        path: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const errorId = randomUUID();
    const detail =
      exception instanceof Error ? exception.stack || exception.message : String(exception);
    this.logger.error(`${request.method} ${request.url} → 500 [${errorId}]: ${detail}`);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: ['Something went wrong on our end. Please try again.'],
      path: request.url,
      timestamp: new Date().toISOString(),
      errorId,
    });
  }
}
