/**
 * Escribe un documento markdown de flujo (nodo del mapa de flujos) en INDEX_INBOX_DIR
 * para que el supervisor lo indexe en Qdrant. Sirve para ir armando un mapa del flujo
 * del proyecto a medida que se investigan bugs o funcionalidades (ej. accounting, shipment).
 */
import * as fs from 'fs';
import * as path from 'path';

function getInboxPath(): string {
  const raw = process.env.INDEX_INBOX_DIR;
  if (raw && raw.trim()) return path.resolve(raw.trim());
  return path.resolve(__dirname, '..', '..', 'INDEX_INBOX');
}

/** Convierte título a slug seguro para nombre de archivo (minúsculas, guiones, sin caracteres raros). */
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
  /** Archivos relacionados (uno por línea o lista). */
  files?: string;
  /** Funciones relacionadas (una por línea o lista). */
  functions?: string;
  /** Resumen del flujo o pasos (texto libre). */
  flow_summary?: string;
  /** ID del bug asociado (opcional). */
  bug_id?: string;
  /** Proyecto/área (opcional, ej. accounting, shipment). */
  project?: string;
};

/**
 * Escribe un markdown de flujo en INDEX_INBOX_DIR. El supervisor lo indexará en el próximo ciclo.
 * El documento es un nodo del mapa de flujos del proyecto (archivos, funciones, descripción).
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
      title: title || 'Flujo',
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
    sections.push('*Documento generado por IA (generated_by_ia: true, source: ai_generated).*\n');
    sections.push('## Descripción\n\n' + (description || '').trim());

    if (files?.trim()) {
      const fileList = files
        .trim()
        .split(/\n/)
        .map((f) => f.trim())
        .filter(Boolean)
        .map((f) => `- ${f}`)
        .join('\n');
      sections.push('## Archivos relacionados\n\n' + fileList);
    }

    if (functions?.trim()) {
      const funcList = functions
        .trim()
        .split(/\n/)
        .map((f) => f.trim())
        .filter(Boolean)
        .map((f) => `- ${f}`)
        .join('\n');
      sections.push('## Funciones\n\n' + funcList);
    }

    if (flow_summary?.trim()) {
      sections.push('## Resumen del flujo\n\n' + flow_summary.trim());
    }

    const content = frontmatterBlock + sections.join('\n\n');

    fs.writeFileSync(filePath, content, 'utf-8');

    return {
      path: filePath,
      message: `Documento de flujo guardado en ${filePath}. El supervisor lo indexará en el próximo ciclo (inbox). Así este nodo pasará a formar parte del mapa de flujos en el Knowledge Hub.`,
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return {
      path: '',
      message: `Error al escribir el documento de flujo en ${inboxDir}: ${err}`,
      error: err,
    };
  }
}
