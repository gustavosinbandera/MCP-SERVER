/**
 * Unit tests for code-boundary chunking.
 */
import { chunkCode, isCodeFileForChunking } from './code-chunking';

describe('code-chunking', () => {
  describe('isCodeFileForChunking', () => {
    it('returns true for C/C++/C# and brace-based extensions', () => {
      expect(isCodeFileForChunking('foo.cpp')).toBe(true);
      expect(isCodeFileForChunking('bar.h')).toBe(true);
      expect(isCodeFileForChunking('baz.cs')).toBe(true);
      expect(isCodeFileForChunking('qux.ts')).toBe(true);
      expect(isCodeFileForChunking('main.java')).toBe(true);
      expect(isCodeFileForChunking('lib.go')).toBe(true);
    });

    it('returns false for non-code extensions', () => {
      expect(isCodeFileForChunking('readme.md')).toBe(false);
      expect(isCodeFileForChunking('data.json')).toBe(false);
      expect(isCodeFileForChunking('notes.txt')).toBe(false);
    });
  });

  describe('chunkCode', () => {
    it('returns single chunk when content is below threshold', () => {
      const content = 'void foo() { return; }\n';
      const result = chunkCode(content, 'foo.cpp', { threshold: 500 });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(content);
      expect(result[0].chunk_index).toBe(0);
      expect(result[0].total_chunks).toBe(1);
    });

    it('splits at brace-depth-0 boundaries when content is long', () => {
      const part1 = 'void a() {\n  x;\n}\n';
      const part2 = 'void b() {\n  y;\n}\n';
      const part3 = 'void c() {\n  z;\n}\n';
      const content = part1 + part2.repeat(200) + part3;
      const result = chunkCode(content, 'file.cpp', {
        targetSize: 800,
        margin: 400,
        threshold: 100,
      });
      expect(result.length).toBeGreaterThan(1);
      result.forEach((chunk) => {
        expect(chunk.total_chunks).toBe(result.length);
      });
      const joined = result.map((c) => c.text).join('');
      expect(joined).toBe(content);
    });

    it('falls back to chunkText for non-code file name', () => {
      const content = 'x'.repeat(3500);
      const result = chunkCode(content, 'readme.md', { threshold: 400 });
      expect(result.length).toBeGreaterThan(1);
      expect(result[0].total_chunks).toBe(result.length);
    });
  });
});
