/**
 * Structured logger: level, message, optional fields.
 * No external dependency; outputs JSON or line format for aggregation.
 * When MCP_LOG_PATH is set, appends each log line to that file (with userId/sessionId from request context when set).
 */

import * as fs from 'fs';
import * as path from 'path';
import { AsyncLocalStorage } from 'async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogRequestContext = { userId?: string; sessionId?: string };

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || 'info';
const LEVEL_ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const logContext = new AsyncLocalStorage<LogRequestContext>();
let logFileStream: fs.WriteStream | null = null;

/** Ruta del archivo de log MCP (para lectura desde API /logs). */
export function getLogFilePath(): string {
  const p = process.env.MCP_LOG_PATH?.trim();
  if (p) return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  return path.resolve(process.cwd(), 'logs', 'mcp.log');
}

function ensureLogFileStream(): fs.WriteStream | null {
  const filePath = getLogFilePath();
  if (logFileStream != null) return logFileStream;
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    logFileStream = fs.createWriteStream(filePath, { flags: 'a' });
    logFileStream.on('error', () => { logFileStream = null; });
  } catch {
    return null;
  }
  return logFileStream;
}

const logSubscribers = new Set<(entry: Record<string, unknown>) => void>();

/** Suscribe a cada nueva entrada de log (para SSE). Devuelve función para desuscribirse. */
export function subscribeToLogEntries(cb: (entry: Record<string, unknown>) => void): () => void {
  logSubscribers.add(cb);
  return () => logSubscribers.delete(cb);
}

function writeToLogFile(line: string): void {
  const stream = ensureLogFileStream();
  if (stream?.writable) {
    stream.write(line + '\n');
  }
  try {
    const entry = JSON.parse(line) as Record<string, unknown>;
    logSubscribers.forEach((cb) => {
      try {
        cb(entry);
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* not JSON, skip broadcast */
  }
}

/**
 * Run an async function with request context (userId, sessionId) so all logs in that scope include them.
 * Use in the HTTP handler before calling handleRequest.
 */
export function runWithLogContext<T>(
  context: LogRequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return logContext.run(context, fn);
}

function levelAllowed(level: LogLevel): boolean {
  const minIdx = LEVEL_ORDER.indexOf(MIN_LEVEL);
  const idx = LEVEL_ORDER.indexOf(level);
  return idx >= 0 && minIdx >= 0 && idx >= minIdx;
}

function formatEntry(level: LogLevel, message: string, fields?: Record<string, unknown>): string {
  const ctx = logContext.getStore();
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(ctx?.userId != null ? { userId: ctx.userId } : {}),
    ...(ctx?.sessionId != null ? { sessionId: ctx.sessionId } : {}),
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
  writeToLogFile(out);
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
