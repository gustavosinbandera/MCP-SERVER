/**
 * User KB: escribe documentos Markdown persistentes por usuario en USER_KB_ROOT_DIR/<userId>/<yyyy>/<mm>/<id>__<slug>.md.
 * El supervisor los indexa en Qdrant (indexUserKbRoots) sin borrarlos.
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getUserKbUserDir } from './config';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'doc';
}

export type WriteUserExperienceDocOptions = {
  userId: string;
  title: string;
  content: string;
  bugOrFeatureId?: string;
  tags?: string[];
};

/**
 * Escribe un documento de experiencia/usuario en USER_KB_ROOT_DIR/<userId>/<yyyy>/<mm>/<id>__<slug>.md.
 * No se borra; el supervisor lo indexa con payload owner_user_id, doc_kind: "experience".
 */
export function writeUserExperienceDoc(options: WriteUserExperienceDocOptions): {
  path: string;
  relativePath: string;
  message: string;
  error?: string;
} {
  const { userId, title, content, bugOrFeatureId, tags } = options;
  const userDir = getUserKbUserDir(userId);
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const id = randomUUID().slice(0, 8);
  const slug = slugify(title || 'doc');
  const filename = `${id}__${slug}.md`;
  const dirPath = path.join(userDir, yyyy, mm);
  const filePath = path.join(dirPath, filename);
  const relativePath = path.join(userId, yyyy, mm, filename).replace(/\\/g, '/');

  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const frontmatter: Record<string, string | string[] | boolean> = {
      title: title || 'Documento',
      doc_kind: 'experience',
      created_at: now.toISOString(),
    };
    if (bugOrFeatureId?.trim()) frontmatter.bug_or_feature_id = bugOrFeatureId.trim();
    if (tags?.length) frontmatter.tags = tags;
    const yamlLines = Object.entries(frontmatter).map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(', ')}]`;
      if (typeof v === 'boolean') return `${k}: ${v}`;
      return `${k}: "${String(v).replace(/"/g, '\\"')}"`;
    });
    const frontmatterBlock = ['---', ...yamlLines, '---', ''].join('\n');
    const body = content?.trim() || '';
    const fullContent = frontmatterBlock + body;
    fs.writeFileSync(filePath, fullContent, 'utf-8');
    return {
      path: filePath,
      relativePath,
      message: `Documento guardado: ${relativePath}. Será indexado por el supervisor.`,
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { path: filePath, relativePath: '', message: '', error: err };
  }
}

export type WriteUploadedKbDocOptions = {
  userId: string;
  originalFilename: string;
  content: string;
  project?: string;
  source?: string;
};

/**
 * Escribe un MD subido por webapp en User KB con frontmatter fusionado (project, source, created_at, doc_kind).
 * Usado por POST /kb/upload.
 */
export function writeUploadedKbDoc(options: WriteUploadedKbDocOptions): { path: string; relativePath: string; error?: string } {
  const { userId, originalFilename, content, project, source } = options;
  const userDir = getUserKbUserDir(userId || 'local');
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const id = randomUUID().slice(0, 8);
  const base = path.basename(originalFilename, '.md') || 'doc';
  const slug = slugify(base);
  const filename = `${id}__${slug}.md`;
  const dirPath = path.join(userDir, yyyy, mm);
  const filePath = path.join(dirPath, filename);
  const relativePath = path.join(userId || 'local', yyyy, mm, filename).replace(/\\/g, '/');

  try {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    let body = content?.trim() || '';
    const existingMatch = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    const existingYaml: Record<string, string | string[] | boolean> = {};
    if (existingMatch) {
      body = body.slice(existingMatch[0].length);
      const block = existingMatch[1];
      block.split('\n').forEach((line) => {
        const colon = line.indexOf(':');
        if (colon > 0) {
          const key = line.slice(0, colon).trim();
          const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
          existingYaml[key] = val;
        }
      });
    }
    const frontmatter: Record<string, string | string[] | boolean> = {
      ...existingYaml,
      title: (existingYaml.title as string) || base,
      doc_kind: 'experience',
      created_at: now.toISOString(),
    };
    if (project?.trim()) frontmatter.project = project.trim();
    if (source?.trim()) frontmatter.source = source.trim();
    const yamlLines = Object.entries(frontmatter).map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(', ')}]`;
      if (typeof v === 'boolean') return `${k}: ${v}`;
      return `${k}: "${String(v).replace(/"/g, '\\"')}"`;
    });
    const frontmatterBlock = ['---', ...yamlLines, '---', ''].join('\n');
    fs.writeFileSync(filePath, frontmatterBlock + body, 'utf-8');
    return { path: filePath, relativePath };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { path: filePath, relativePath: '', error: err };
  }
}
