/**
 * Unit tests for logger (level filtering, format).
 */
import { log, debug, info, warn, error } from './logger';

describe('logger', () => {
  let stderrWrite: jest.SpyInstance;
  let stdoutWrite: jest.SpyInstance;

  beforeEach(() => {
    stderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrWrite.mockRestore();
    stdoutWrite.mockRestore();
  });

  it('info writes JSON line to stdout', () => {
    info('test message', { key: 'value' });
    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    const out = stdoutWrite.mock.calls[0][0];
    const parsed = JSON.parse(out);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test message');
    expect(parsed.key).toBe('value');
    expect(parsed.ts).toBeDefined();
  });

  it('error writes JSON line to stderr', () => {
    error('error message');
    expect(stderrWrite).toHaveBeenCalledTimes(1);
    const out = stderrWrite.mock.calls[0][0];
    const parsed = JSON.parse(out);
    expect(parsed.level).toBe('error');
    expect(parsed.message).toBe('error message');
  });

  it('log accepts level and message', () => {
    log('warn', 'warn message');
    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(stdoutWrite.mock.calls[0][0]);
    expect(parsed.level).toBe('warn');
    expect(parsed.message).toBe('warn message');
  });

  it('debug/warn/info/error are callable', () => {
    debug('d');
    warn('w');
    expect(stdoutWrite).toHaveBeenCalled();
  });
});
