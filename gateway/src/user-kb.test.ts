/**
 * Unit tests for User KB (writeUserExperienceDoc).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { writeUserExperienceDoc } from './user-kb';

describe('user-kb', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `user-kb-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    process.env.USER_KB_ROOT_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.USER_KB_ROOT_DIR;
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it('writes a document to USER_KB_ROOT_DIR/<userId>/<yyyy>/<mm>/<id>__<slug>.md', () => {
    const result = writeUserExperienceDoc({
      userId: 'user-1',
      title: 'Hallazgo bug login',
      content: 'El botón no responde en Safari.',
    });
    expect(result.error).toBeUndefined();
    expect(result.relativePath).toMatch(/^user-1\/\d{4}\/\d{2}\/[a-f0-9]+__hallazgo-bug-login\.md$/);
    expect(fs.existsSync(result.path)).toBe(true);
    const content = fs.readFileSync(result.path, 'utf-8');
    expect(content).toContain('title: "Hallazgo bug login"');
    expect(content).toContain('doc_kind: "experience"');
    expect(content).toContain('El botón no responde en Safari.');
  });

  it('includes bugOrFeatureId and tags in frontmatter when provided', () => {
    const result = writeUserExperienceDoc({
      userId: 'user-2',
      title: 'Feature X',
      content: 'Descripción.',
      bugOrFeatureId: 'BUG-123',
      tags: ['frontend', 'safari'],
    });
    expect(result.error).toBeUndefined();
    const content = fs.readFileSync(result.path, 'utf-8');
    expect(content).toContain('bug_or_feature_id: "BUG-123"');
    expect(content).toMatch(/tags:.*frontend.*safari/);
  });
});
