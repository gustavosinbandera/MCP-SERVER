/**
 * Write a flow Markdown document (flow-map node) into INDEX_INBOX_DIR so the supervisor
 * can index it into Qdrant. This helps build a project flow map as bugs/features are
 * investigated (e.g. accounting, shipment).
 */
import * as fs from 'fs';
import * as path from 'path';
import { getInboxPath } from './config';

/** Convert title to a safe filename slug (lowercase, dashes, no weird chars). */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'flow';
}

export type WriteFlowDocOptions = {
  title: string;
  description: string;
  /** Related files (one per line or list). */
  files?: string;
  /** Related functions (one per line or list). */
  functions?: string;
  /** Flow summary or steps (free text). */
  flow_summary?: string;
  /** Associated bug ID (optional). */
  bug_id?: string;
  /** Project/area (optional, e.g. accounting, shipment). */
  project?: string;
};

/**
 * Write a flow Markdown doc into INDEX_INBOX_DIR. The supervisor will index it on the next cycle.
 * The document is a node in the project flow map (files, functions, description).
 */
export function writeFlowDocToInbox(options: WriteFlowDocOptions): { path: string; message: string; error?: string } {
  const { title, description, files, functions, flow_summary, bug_id, project } = options;
  const inboxDir = getInboxPath();

  try {
    if (!fs.existsSync(inboxDir)) {
      fs.mkdirSync(inboxDir, { recursive: true });
    }

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const slug = slugify(title || 'flow');
    const filename = `flow-${slug}-${date}.md`;
    const filePath = path.join(inboxDir, filename);

    const frontmatter: Record<string, string | boolean> = {
      title: title || 'Flow',
      type: 'flow_doc',
      date,
      generated_by_ia: true,
      source: 'ai_generated',
    };
    if (bug_id?.trim()) frontmatter.bug_id = bug_id.trim();
    if (project?.trim()) frontmatter.project = project.trim();

    const yamlLines = Object.entries(frontmatter).map(([k, v]) =>
      typeof v === 'boolean' ? `${k}: ${v}` : `${k}: "${String(v).replace(/"/g, '\\"')}"`
    );
    const frontmatterBlock = ['---', ...yamlLines, '---', ''].join('\n');

    const sections: string[] = [];
    sections.push('*AI-generated document (generated_by_ia: true, source: ai_generated).*');
    sections.push('## Description\n\n' + (description || '').trim());

    if (files?.trim()) {
      const fileList = files
        .trim()
        .split(/\n/)
        .map((f) => f.trim())
        .filter(Boolean)
        .map((f) => `- ${f}`)
        .join('\n');
      sections.push('## Related files\n\n' + fileList);
    }

    if (functions?.trim()) {
      const funcList = functions
        .trim()
        .split(/\n/)
        .map((f) => f.trim())
        .filter(Boolean)
        .map((f) => `- ${f}`)
        .join('\n');
      sections.push('## Functions\n\n' + funcList);
    }

    if (flow_summary?.trim()) {
      sections.push('## Flow summary\n\n' + flow_summary.trim());
    }

    const content = frontmatterBlock + sections.join('\n\n');

    fs.writeFileSync(filePath, content, 'utf-8');

    return {
      path: filePath,
      message: `Flow document saved to ${filePath}. The supervisor will index it on the next cycle (inbox). This node will become part of the Knowledge Hub flow map.`,
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return {
      path: '',
      message: `Failed to write flow document to ${inboxDir}: ${err}`,
      error: err,
    };
  }
}
