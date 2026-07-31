import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * HttpExceptionFilter
 * Global error handler — returns friendly, consistent error responses.
 * All errors will have the format: { statusCode, message, path, timestamp }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Log errors to console (visible in terminal)
    this.logger.error(
      `${request.method} ${request.url} → ${status}: ${JSON.stringify(message)}`,
    );

    response.status(status).json({
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
