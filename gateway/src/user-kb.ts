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
