/**
 * Unit tests for shared-dirs (listSharedDir, readSharedFile) using tmp dir and mocked config.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { listSharedDir, readSharedFile, getSharedRootsForDisplay } from './shared-dirs';

jest.mock('./config', () => ({
  getSharedRoots: jest.fn(),
}));

const getSharedRootsMock = jest.mocked(require('./config').getSharedRoots);

describe('shared-dirs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-dirs-test-'));
    getSharedRootsMock.mockReturnValue([tmpDir]);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  describe('listSharedDir', () => {
    it('returns null when SHARED_DIRS is empty', () => {
      getSharedRootsMock.mockReturnValue([]);
      expect(listSharedDir()).toBeNull();
    });

    it('returns entries for root dir', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a');
      fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'b');
      fs.mkdirSync(path.join(tmpDir, 'sub'));
      const result = listSharedDir('');
      expect(result).not.toBeNull();
      expect(result!.root).toBe(tmpDir);
      expect(result!.entries.sort()).toEqual(['a.txt', 'b.txt', 'sub/']);
    });

    it('returns entries for subdir', () => {
      const sub = path.join(tmpDir, 'sub');
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, 'f.txt'), 'f');
      const result = listSharedDir('sub');
      expect(result).not.toBeNull();
      expect(result!.entries).toEqual(['f.txt']);
    });

    it('returns null for path outside root (path traversal)', () => {
      const result = listSharedDir('..');
      expect(result).toBeNull();
    });
  });

  describe('readSharedFile', () => {
    it('returns content for existing file', () => {
      const p = path.join(tmpDir, 'readme.txt');
      fs.writeFileSync(p, 'hello world', 'utf-8');
      const result = readSharedFile('readme.txt');
      expect(result).not.toBeNull();
      expect(result!.content).toBe('hello world');
      expect(result!.path).toBe(p);
    });

    it('returns null for non-existent file', () => {
      expect(readSharedFile('nonexistent.txt')).toBeNull();
    });

    it('returns null for directory', () => {
      fs.mkdirSync(path.join(tmpDir, 'adir'));
      expect(readSharedFile('adir')).toBeNull();
    });
  });

  describe('getSharedRootsForDisplay', () => {
    it('returns getSharedRoots result', () => {
      expect(getSharedRootsForDisplay()).toEqual([tmpDir]);
    });
  });
});
