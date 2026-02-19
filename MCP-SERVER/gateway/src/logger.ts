/**
 * Structured logger: level, message, optional fields.
 * No external dependency; outputs JSON or line format for aggregation.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || 'info';
const LEVEL_ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function levelAllowed(level: LogLevel): boolean {
  const minIdx = LEVEL_ORDER.indexOf(MIN_LEVEL);
  const idx = LEVEL_ORDER.indexOf(level);
  return idx >= 0 && minIdx >= 0 && idx >= minIdx;
}

function formatEntry(level: LogLevel, message: string, fields?: Record<string, unknown>): string {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  return JSON.stringify(entry);
}

export function log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  if (!levelAllowed(level)) return;
  const out = formatEntry(level, message, fields);
  if (level === 'error') {
    process.stderr.write(out + '\n');
  } else {
    process.stdout.write(out + '\n');
  }
}

export function debug(message: string, fields?: Record<string, unknown>): void {
  log('debug', message, fields);
}

export function info(message: string, fields?: Record<string, unknown>): void {
  log('info', message, fields);
}

export function warn(message: string, fields?: Record<string, unknown>): void {
  log('warn', message, fields);
}

export function error(message: string, fields?: Record<string, unknown>): void {
  log('error', message, fields);
}
