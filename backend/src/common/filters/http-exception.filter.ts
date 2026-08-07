import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

/**
 * Global error handler — returns consistent responses shaped as
 * `{ statusCode, message, path, timestamp, errorId? }`.
 *
 * Only deliberate `HttpException`s describe themselves to the caller. Anything
 * else used to be echoed back verbatim via `exception.message`, which meant
 * Postgres and PostgREST errors — table names, column names, constraint names,
 * occasionally fragments of a failing query — were served to whoever triggered
 * them. Those are now logged with a correlation id and answered generically.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorId: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;

      this.logger.warn(
        `${request.method} ${request.url} → ${status}: ${JSON.stringify(message)}`,
      );
    } else {
      // Unhandled: log everything we have, tell the caller nothing beyond the id.
      errorId = randomUUID();
      const detail = exception instanceof Error ? exception.stack || exception.message : String(exception);
      this.logger.error(
        `${request.method} ${request.url} → 500 [${errorId}]: ${detail}`,
      );
      message = 'Something went wrong on our end. Please try again.';
    }

    response.status(status).json({
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(errorId ? { errorId } : {}),
    });
  }
}
