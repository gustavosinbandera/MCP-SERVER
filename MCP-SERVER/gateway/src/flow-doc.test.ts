/**
 * Unit tests for flow-doc (writeFlowDocToInbox) using tmp dir and mocked config.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { writeFlowDocToInbox, type WriteFlowDocOptions } from './flow-doc';

jest.mock('./config', () => ({
  getInboxPath: jest.fn(),
}));

const getInboxPathMock = jest.mocked(require('./config').getInboxPath);

describe('flow-doc', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-doc-test-'));
    getInboxPathMock.mockReturnValue(tmpDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  describe('writeFlowDocToInbox', () => {
    it('writes markdown file with frontmatter and sections', () => {
      const opts: WriteFlowDocOptions = {
        title: 'Test Flow',
        description: 'A test description',
      };
      const result = writeFlowDocToInbox(opts);
      expect(result.error).toBeUndefined();
      expect(result.path).toContain(tmpDir);
      expect(result.path).toMatch(/flow-test-flow-\d{4}-\d{2}-\d{2}\.md$/);
      expect(fs.existsSync(result.path)).toBe(true);
      const content = fs.readFileSync(result.path, 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('title: "Test Flow"');
      expect(content).toContain('type: "flow_doc"');
      expect(content).toContain('## Descripción');
      expect(content).toContain('A test description');
    });

    it('includes files and functions sections when provided', () => {
      const result = writeFlowDocToInbox({
        title: 'Flow With Sections',
        description: 'Desc',
        files: 'src/a.ts\nsrc/b.ts',
        functions: 'foo()\nbar()',
      });
      expect(result.error).toBeUndefined();
      const content = fs.readFileSync(result.path, 'utf-8');
      expect(content).toContain('## Archivos relacionados');
      expect(content).toContain('- src/a.ts');
      expect(content).toContain('## Funciones');
      expect(content).toContain('- foo()');
    });

    it('includes bug_id and project in frontmatter when provided', () => {
      const result = writeFlowDocToInbox({
        title: 'Bug Flow',
        description: 'D',
        bug_id: 'BUG-123',
        project: 'accounting',
      });
      expect(result.error).toBeUndefined();
      const content = fs.readFileSync(result.path, 'utf-8');
      expect(content).toContain('bug_id: "BUG-123"');
      expect(content).toContain('project: "accounting"');
    });

    it('creates inbox dir if missing', () => {
      const sub = path.join(tmpDir, 'inbox');
      getInboxPathMock.mockReturnValue(sub);
      const result = writeFlowDocToInbox({ title: 'T', description: 'D' });
      expect(result.error).toBeUndefined();
      expect(fs.existsSync(sub)).toBe(true);
      expect(fs.statSync(sub).isDirectory()).toBe(true);
    });

    it('returns result with path and message on success', () => {
      const result = writeFlowDocToInbox({ title: 'Success', description: 'D' });
      expect(result.path).toBeTruthy();
      expect(result.message).toContain('guardado');
      expect(result.error).toBeUndefined();
    });
  });
});
