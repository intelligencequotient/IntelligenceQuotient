import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

/**
 * Turns a PostgREST/Postgres error into the right HTTP exception.
 *
 * Services used to do `if (error) throw new Error(error.message)`, which makes
 * every database complaint a 500 — including the ones that are squarely the
 * caller's fault. That is wrong twice over: the client is told "our end" when it
 * sent something invalid, and (since the exception filter stopped echoing raw
 * messages) the actual reason is no longer visible anywhere but the logs.
 *
 * A real example this was written for: the admin console posted
 * `t_type: 'jee_main'` into an enum column that has no such member. Postgres
 * answered `22P02 invalid input value for enum test_type`, the API answered
 * "Something went wrong on our end", and the console showed a generic failure
 * with nothing to act on.
 *
 * Client-caused codes get a 4xx with a message safe to show. Everything else
 * stays a 500 with the detail confined to the logs.
 */

const logger = new Logger('SupabaseError');

/** Postgres SQLSTATE classes that mean "the request was bad", not "we broke". */
const CLIENT_ERROR_CODES: Record<string, (detail: string) => Error> = {
  // invalid_text_representation — e.g. a value outside an enum, or a malformed uuid
  '22P02': (d) => new BadRequestException(d),
  // not_null_violation
  '23502': (d) => new BadRequestException(d),
  // foreign_key_violation — referenced row does not exist
  '23503': (d) => new BadRequestException(d),
  // unique_violation
  '23505': (d) => new ConflictException(d),
  // check_violation
  '23514': (d) => new BadRequestException(d),
  // string_data_right_truncation — value too long for the column
  '22001': (d) => new BadRequestException(d),
  // numeric_value_out_of_range
  '22003': (d) => new BadRequestException(d),
};

/** Rewrites Postgres's phrasing into something a user can act on. */
function humanise(error: any): string {
  const message = String(error?.message ?? '');

  const enumMatch = message.match(/invalid input value for enum (\w+): "([^"]*)"/i);
  if (enumMatch) {
    return `"${enumMatch[2]}" is not a valid ${enumMatch[1].replace(/_/g, ' ')}.`;
  }

  if (String(error?.code) === '23505') {
    return 'That record already exists.';
  }

  if (String(error?.code) === '23503') {
    return 'That request references something that does not exist.';
  }

  if (String(error?.code) === '23502') {
    const column = message.match(/column "([^"]+)"/i)?.[1];
    return column ? `${column} is required.` : 'A required field is missing.';
  }

  // Fall back to Postgres's own text. Only reached for codes already classified
  // as client errors, so it describes the submitted data rather than internals.
  return message || 'The request could not be processed.';
}

/**
 * Always throws. `context` is logged, never returned to the caller.
 *
 * Declared as `never` so callers can `throwSupabaseError(...)` on the last line
 * of a branch without TypeScript losing the narrowing.
 */
export function throwSupabaseError(error: any, context: string): never {
  const code = String(error?.code ?? '');
  const build = CLIENT_ERROR_CODES[code];

  if (build) {
    logger.warn(`${context}: [${code}] ${error?.message}`);
    throw build(humanise(error));
  }

  logger.error(`${context}: [${code || 'no code'}] ${error?.message}`);
  throw new InternalServerErrorException('Something went wrong on our end. Please try again.');
}
