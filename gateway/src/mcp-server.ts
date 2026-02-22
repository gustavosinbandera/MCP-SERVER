/**
 * MCP Knowledge Hub - MCP Server (stdio)
 * Los IDEs (Cursor, VS Code, etc.) conectan con su cliente MCP y la IA usa la herramienta search_docs.
 * Ejecutar: node dist/mcp-server.js (el IDE suele arrancar este proceso y comunica por stdin/stdout).
 * Env: se cargan desde gateway/.env (ruta fija respecto a dist/mcp-server.js para que funcione aunque el cwd no sea gateway).
 */

import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { z } from 'zod';
import { searchDocs, countDocs, type SearchOptions } from './search';
import { listSharedDir, readSharedFile, getSharedRootsForDisplay } from './shared-dirs';
import { indexUrl, indexUrlWithLinks, indexSite, listUrlLinks, formatListUrlLinksMarkdown, viewUrlContent, loginMediaWiki } from './url-indexer';
import { writeFlowDocToInbox } from './flow-doc';
import { writeUserExperienceDoc } from './user-kb';
import { runRepoGit } from './repo-git';
import { searchGitHubRepos } from './github-search';
import {
  hasClickUpToken,
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  getTasks,
  createTask,
  createSubtask,
  getTask,
  updateTask,
  type CreateTaskBody,
  type UpdateTaskBody,
} from './clickup-client';
import {
  hasAzureDevOpsConfig,
  listWorkItems,
  getWorkItem,
  getWorkItemWithRelations,
  extractChangesetIds,
  getChangeset,
  getChangesetChanges,
  getChangesetFileDiff,
  pickAuthor,
} from './azure-devops-client';
import { info as logInfo } from './logger';

/** Nombre del proyecto/hub (ej. "BlueIvory Beta"). Opcional, para mostrar en respuestas. */
const KNOWLEDGE_HUB_NAME = (process.env.KNOWLEDGE_HUB_NAME || process.env.PROJECT_NAME || '').trim();

type SearchFilterArgs = {
  project?: string;
  branch?: string;
  source_type?: string;
  domain?: string;
  class_name?: string;
  referenced_type?: string;
  file_name?: string;
};

function buildSearchOptionsFromArgs(args: SearchFilterArgs): SearchOptions | undefined {
  const project = args.project?.trim();
  const branch = args.branch?.trim();
  const source_type = args.source_type?.trim();
  const domain = args.domain?.trim();
  const class_name = args.class_name?.trim();
  const referenced_type = args.referenced_type?.trim();
  const file_name = args.file_name?.trim();
  if (!project && !branch && !source_type && !domain && !class_name && !referenced_type && !file_name) return undefined;
  return {
    project: project || undefined,
    branch: branch || undefined,
    source_type: source_type || undefined,
    domain: domain || undefined,
    class_name: class_name || undefined,
    referenced_type: referenced_type || undefined,
    file_name: file_name || undefined,
  };
}

function formatFilterInfo(opts: SearchOptions): string {
  const parts = [
    opts.project && `project=${opts.project}`,
    opts.branch && `branch=${opts.branch}`,
    opts.source_type && `source_type=${opts.source_type}`,
    opts.domain && `domain=${opts.domain}`,
    opts.class_name && `class_name=${opts.class_name}`,
    opts.referenced_type && `referenced_type=${opts.referenced_type}`,
    opts.file_name && `file_name=${opts.file_name}`,
  ].filter(Boolean);
  return parts.join(', ');
}

export type McpContext = { userId: string };

/**
 * Factory: crea un McpServer con el set completo de tools.
 * ctx.userId se usa para rutas/payloads por usuario (ej. User KB en Fase 4).
 * Modo stdio: buildMcpServer({ userId: 'local' }).
 */
export function buildMcpServer(ctx: McpContext): McpServer {
  const mcpServer = new McpServer({
    name: 'mcp-knowledge-hub',
    version: '0.1.0',
  });

  mcpServer.tool(
  'search_docs',
  'Busca en la documentación indexada del Knowledge Hub (Qdrant). Filtros opcionales (alineados con el payload indexado): project, branch (classic|blueivory), source_type (code|doc|url), domain, class_name (clase que contiene el doc), referenced_type (tipo referenciado), file_name. Usa esta herramienta cuando necesites información de la documentación del proyecto, ADRs, bugs, flujos o docs corporativos.',
  {
    query: z.string(),
    limit: z.number().optional(),
    project: z.string().optional(),
    branch: z.string().optional(),
    source_type: z.string().optional(),
    domain: z.string().optional(),
    class_name: z.string().optional(),
    referenced_type: z.string().optional(),
    file_name: z.string().optional(),
  } as any,
  async (args: {
    query: string;
    limit?: number;
    project?: string;
    branch?: string;
    source_type?: string;
    domain?: string;
    class_name?: string;
    referenced_type?: string;
    file_name?: string;
  }) => {
    const toolStart = Date.now();
    logInfo('tool search_docs start', { query: (args.query ?? '').slice(0, 80) });
    const query = args.query ?? '';
    const limit = args.limit ?? 10;
    const maxResults = Math.min(Math.max(1, limit), 100);
    const opts = buildSearchOptionsFromArgs(args);
    const { results, total } = await searchDocs(query, maxResults, opts);
    logInfo('tool search_docs end', { elapsedMs: Date.now() - toolStart, total });
    const header = KNOWLEDGE_HUB_NAME ? `[${KNOWLEDGE_HUB_NAME}] ` : '';
    const filterInfo = opts ? ` Filtros: ${formatFilterInfo(opts)}` : '';
    const text =
      results.length === 0
        ? `Sin resultados para "${query}".`
        : results
            .map(
              (r, i) =>
                `[${i + 1}] ${(r.payload?.title as string) || 'Sin título'}\n${(r.payload?.content as string) || ''}`,
            )
            .join('\n\n---\n\n');
    return {
      content: [
        {
          type: 'text' as const,
          text: `${header}Búsqueda: "${query}" (${total} resultado(s))${filterInfo}\n\n${text}`,
        },
      ],
    };
  },
);

mcpServer.tool(
  'count_docs',
  'Devuelve cuántos documentos hay indexados en la colección de Qdrant (mcp_docs). Úsala cuando necesites saber el total de documentos en el Knowledge Hub.',
  {} as any,
  async () => {
    const { count, collection } = await countDocs();
    const projectLine = KNOWLEDGE_HUB_NAME ? `Proyecto: ${KNOWLEDGE_HUB_NAME}\n` : '';
    const text = `${projectLine}Colección: ${collection}\nDocumentos indexados: ${count}`;
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

mcpServer.tool(
  'analize_code',
  'Análisis de código con contexto de la BD: dado una descripción (bug, funcionalidad, componente), busca en el Knowledge Hub (Qdrant) documentación relevante y devuelve el conteo de docs + fragmentos para que la IA analice el código con contexto. Úsala cuando el usuario pida analizar código, reporte un bug o necesite contexto desde la documentación indexada.',
  {
    description: z.string(),
    component: z.string().optional(),
    project: z.string().optional(),
    branch: z.string().optional(),
    source_type: z.string().optional(),
    domain: z.string().optional(),
    class_name: z.string().optional(),
    referenced_type: z.string().optional(),
    file_name: z.string().optional(),
    limit: z.number().optional(),
  } as any,
  async (args: {
    description: string;
    component?: string;
    project?: string;
    branch?: string;
    source_type?: string;
    domain?: string;
    class_name?: string;
    referenced_type?: string;
    file_name?: string;
    limit?: number;
  }) => {
    const description = (args.description || '').trim();
    const component = (args.component || '').trim();
    const limit = Math.min(Math.max(1, args.limit ?? 15), 30);
    const queryParts = [description];
    if (component) queryParts.push(component);
    const query = queryParts.join(' ');
    const { count } = await countDocs();
    const opts = buildSearchOptionsFromArgs(args);
    const { results, total } = await searchDocs(query, limit, opts);
    const hubName = KNOWLEDGE_HUB_NAME ? ` – ${KNOWLEDGE_HUB_NAME}` : '';
    const projectInfo = opts?.project ? ` | Proyecto: ${opts.project}` : opts ? ` | Filtros: ${formatFilterInfo(opts)}` : '';
    const header = [
      `[ANÁLISIS DE CÓDIGO${hubName} – contexto desde la BD]`,
      `Colección: mcp_docs | Documentos totales indexados: ${count}${projectInfo}`,
      `Búsqueda: "${query}" → ${total} resultado(s) relevantes`,
      ``,
    ].join('\n');
    const body =
      results.length === 0
        ? `Sin documentos en la BD que coincidan con la descripción. Considera indexar más documentación (index_url, index_site) o ampliar la descripción.`
        : results
            .map((r, i) => {
              const title = (r.payload?.title as string) || 'Sin título';
              const url = r.payload?.url as string | undefined;
              const sourcePath = r.payload?.source_path as string | undefined;
              const proj = r.payload?.project as string | undefined;
              const meta = [url && `URL: ${url}`, sourcePath && `Ruta: ${sourcePath}`, proj && `Proyecto: ${proj}`]
                .filter(Boolean)
                .join(' | ');
              return `[${i + 1}] ${title}${meta ? `\n${meta}` : ''}\n${(r.payload?.content as string) || ''}`;
            })
            .join('\n\n---\n\n');
    const text = `${header}\n${body}`;
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

mcpServer.tool(
  'index_url',
  'Indexa el contenido de una URL en Qdrant (Knowledge Hub). Obtiene la página, convierte HTML a texto y lo guarda en mcp_docs. Si la URL ya existía, se actualiza. project opcional (ej. magaya-help) para filtrar después por source_type=url. Para páginas SPA usa render_js: true. Úsala para añadir documentación o páginas importantes desde internet.',
  { url: z.string(), render_js: z.boolean().optional(), project: z.string().optional() } as any,
  async (args: { url: string; render_js?: boolean; project?: string }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL debe comenzar con http:// o https://' }],
      };
    }
    const result = await indexUrl(url, { renderJs: args.render_js, project: args.project?.trim() });
    if (result.indexed) {
      return {
        content: [{ type: 'text' as const, text: `URL indexada: ${result.title}\n${url}` }],
      };
    }
    return {
      content: [{ type: 'text' as const, text: `Error al indexar ${url}: ${result.error ?? 'desconocido'}` }],
    };
  },
);

mcpServer.tool(
  'index_url_with_links',
  'Indexa una URL y hasta max_links páginas enlazadas del mismo dominio (documentación, FAQ, etc.). Para sitios SPA (ej. help.magaya.com) usa render_js: true. Úsala para indexar un sitio y sus subpáginas relacionadas.',
  { url: z.string(), max_links: z.number().optional(), render_js: z.boolean().optional() } as any,
  async (args: { url: string; max_links?: number; render_js?: boolean }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL debe comenzar con http:// o https://' }],
      };
    }
    const maxLinks = Math.min(Math.max(0, args.max_links ?? 20), 50);
    const result = await indexUrlWithLinks(url, maxLinks, { renderJs: args.render_js });
    const lines = [
      `Indexadas: ${result.indexed}/${result.total} páginas.`,
      result.urls.length > 0 ? `URLs: ${result.urls.join(', ')}` : '',
      result.errors.length > 0 ? `Errores: ${result.errors.join('; ')}` : '',
    ].filter(Boolean);
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  },
);

mcpServer.tool(
  'index_site',
  'Indexa todo un sitio desde una URL semilla: recorre enlaces del mismo dominio (BFS) hasta indexar max_pages páginas. Con skip_already_indexed: true solo indexa URLs nuevas y salta las que ya están en Qdrant (útil para reanudar sin reindexar). Para sitios SPA (ej. help.magaya.com) usa render_js: true.',
  {
    url: z.string(),
    max_pages: z.number().optional(),
    render_js: z.boolean().optional(),
    skip_already_indexed: z.boolean().optional(),
  } as any,
  async (args: { url: string; max_pages?: number; render_js?: boolean; skip_already_indexed?: boolean }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL debe comenzar con http:// o https://' }],
      };
    }
    const maxPages = Math.min(Math.max(1, args.max_pages ?? 1000), 20000);
    const result = await indexSite(url, maxPages, {
      renderJs: args.render_js,
      skipAlreadyIndexed: args.skip_already_indexed,
    });
    const lines = [
      `Indexadas: ${result.indexed} páginas.`,
      result.skipped > 0 ? `Saltadas (ya en índice): ${result.skipped} páginas.` : '',
      result.urls.length > 0 ? `URLs (primeras 20): ${result.urls.slice(0, 20).join(', ')}${result.urls.length > 20 ? '...' : ''}` : '',
      result.errors.length > 0 ? `Errores (primeros 5): ${result.errors.slice(0, 5).join('; ')}` : '',
    ].filter(Boolean);
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  },
);

mcpServer.tool(
  'write_flow_doc',
  'Crea un documento markdown (nodo del mapa de flujos) y lo guarda en INDEX_INBOX_DIR para que el supervisor lo indexe. Cuándo usarla: (1) Si el usuario dice "usar-mcp": crea el documento y empieza a añadir la información que te ayude a formar un mapa de cómo se interconecta el código (archivos, funciones, descripción del flujo). (2) Si usas una tool de análisis de código o revisión de flujo (analize_code, search_docs) y obtienes resultados relevantes: también crea el documento y almacénalo. Los documentos generados por la IA llevan en el frontmatter los campos generated_by_ia: true y source: ai_generated para identificarlos explícitamente. Parámetros: title, description; opcional: files, functions, flow_summary, bug_id, project.',
  {
    title: z.string(),
    description: z.string(),
    files: z.string().optional(),
    functions: z.string().optional(),
    flow_summary: z.string().optional(),
    bug_id: z.string().optional(),
    project: z.string().optional(),
  } as any,
  async (args: {
    title: string;
    description: string;
    files?: string;
    functions?: string;
    flow_summary?: string;
    bug_id?: string;
    project?: string;
  }) => {
    const result = writeFlowDocToInbox({
      title: args.title ?? '',
      description: args.description ?? '',
      files: args.files,
      functions: args.functions,
      flow_summary: args.flow_summary,
      bug_id: args.bug_id,
      project: args.project,
    });
    return {
      content: [{ type: 'text' as const, text: result.message }],
    };
  },
);

mcpServer.tool(
  'documentar_sesion',
  'Guarda un documento Markdown de experiencia/sesión en la KB personal del usuario (persistente, no se borra). Se indexa en Qdrant con owner_user_id y doc_kind "experience". Úsala para documentar sesiones, hallazgos, bugs o features. Parámetros: title, content (markdown); opcionales: bugOrFeatureId, tags (array de strings).',
  {
    title: z.string(),
    content: z.string(),
    bugOrFeatureId: z.string().optional(),
    tags: z.array(z.string()).optional(),
  } as any,
  async (args: { title: string; content: string; bugOrFeatureId?: string; tags?: string[] }) => {
    const result = writeUserExperienceDoc({
      userId: ctx.userId,
      title: args.title ?? '',
      content: args.content ?? '',
      bugOrFeatureId: args.bugOrFeatureId?.trim(),
      tags: args.tags?.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()),
    });
    if (result.error) {
      return {
        content: [{ type: 'text' as const, text: `Error al guardar: ${result.error}` }],
      };
    }
    return {
      content: [{ type: 'text' as const, text: result.message }],
    };
  },
);

mcpServer.tool(
  'list_shared_dir',
  'Lista directorios y archivos en un directorio compartido (sin índice). Usa relative_path vacío para la raíz del primer directorio compartido (SHARED_DIRS).',
  { relative_path: z.string().optional() } as any,
  async (args: { relative_path?: string }) => {
    const roots = getSharedRootsForDisplay();
    if (roots.length === 0) {
      const envVal = process.env.SHARED_DIRS;
      const diag =
        envVal === undefined
          ? ' (variable no definida en el proceso)'
          : envVal === ''
            ? ' (variable vacía)'
            : ` (valor recibido: "${envVal}")`;
      return {
        content: [
          {
            type: 'text' as const,
            text: `No hay directorios compartidos configurados. SHARED_DIRS vacío o inválido${diag}. Comprueba .cursor/mcp.json y reinicia Cursor.`,
          },
        ],
      };
    }
    const relativePath = args.relative_path ?? '';
    const result = listSharedDir(relativePath);
    if (!result) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No se pudo listar "${relativePath || '(raíz)'}" en ${roots[0]}. Ruta inválida o no existe.`,
          },
        ],
      };
    }
    const pathLabel = relativePath ? relativePath : '(raíz)';
    const text = `Directorio compartido: ${result.root}\nRuta: ${pathLabel}\n\nEntradas:\n${result.entries.join('\n')}`;
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

mcpServer.tool(
  'read_shared_file',
  'Lee el contenido de un archivo dentro del directorio compartido (sin índice). Pasa la ruta relativa al archivo (ej. "readme.txt" o "src/index.js").',
  { relative_path: z.string() } as any,
  async (args: { relative_path: string }) => {
    const roots = getSharedRootsForDisplay();
    if (roots.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No hay directorios compartidos configurados (SHARED_DIRS vacío).',
          },
        ],
      };
    }
    const result = readSharedFile(args.relative_path);
    if (!result) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No se pudo leer "${args.relative_path}" en ${roots[0]}. Ruta inválida, no existe o no es un archivo.`,
          },
        ],
      };
    }
    const text = `Archivo: ${result.path}\n\n---\n\n${result.content}`;
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

mcpServer.tool(
  'list_url_links',
  'Lista cuántos subenlaces y archivos contiene una URL. Obtiene la página, extrae todos los href y devuelve conteos y listas en Markdown. Úsala para inspeccionar enlaces remotos, listar URLs dentro de una página o listar archivos referenciados.',
  { url: z.string() } as any,
  async (args: { url: string }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL debe comenzar con http:// o https://' }],
      };
    }
    const result = await listUrlLinks(url);
    const text = formatListUrlLinksMarkdown(result);
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

mcpServer.tool(
  'view_url',
  'Muestra el contenido de una URL en formato Markdown (título, texto y bloques de código con ```). En MediaWiki solo se devuelve el artículo (.mw-parser-output), sin menús ni pie. Para páginas que cargan el contenido por JavaScript (SPA, ej. help.magaya.com), usa render_js: true para abrir la URL en un navegador headless y obtener el HTML renderizado. Úsala para ver una página: ver url, inspeccionar url.',
  { url: z.string(), render_js: z.boolean().optional() } as any,
  async (args: { url: string; render_js?: boolean }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL debe comenzar con http:// o https://' }],
      };
    }
    const result = await viewUrlContent(url, { renderJs: args.render_js });
    if (result.error) {
      return {
        content: [{ type: 'text' as const, text: `## Error\n\n**URL:** ${url}\n\n${result.error}` }],
      };
    }
    return {
      content: [{ type: 'text' as const, text: result.content }],
    };
  },
);

mcpServer.tool(
  'mediawiki_login',
  'Inicia sesión en un sitio MediaWiki (obtiene token de login vía API y guarda la sesión en cookies). Usa las credenciales INDEX_URL_USER e INDEX_URL_PASSWORD de gateway/.env. Después de un login correcto, view_url, index_url y list_url_links podrán acceder a páginas protegidas de ese sitio. Úsala cuando una URL pida login: login mediawiki, iniciar sesión, login url.',
  { url: z.string() } as any,
  async (args: { url: string }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: '## Error\n\nLa URL u origen debe comenzar con http:// o https://' }],
      };
    }
    const result = await loginMediaWiki(url);
    const title = result.success ? 'Sesión iniciada' : 'Error de login';
    const text = `## ${title}\n\n${result.message}`;
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

mcpServer.tool(
  'search_github_repos',
  'SOLO BÚSQUEDA en GitHub: lista repositorios existentes por tema (no crea repos, no escribe scripts). Cuando el usuario diga "buscar en github X", "repos de X", "encontrar repos esp32/mcp/etc" → usa esta tool y devuelve los resultados; no crear repos ni código. Parámetros: topic (tema, ej. esp32, MCP server), opcional limit (máx. 30), opcional sort (updated | stars | forks).',
  {
    topic: z.string(),
    limit: z.number().optional(),
    sort: z.enum(['updated', 'stars', 'forks']).optional(),
  } as any,
  async (args: { topic: string; limit?: number; sort?: 'updated' | 'stars' | 'forks' }) => {
    const topic = (args.topic ?? '').trim();
    if (!topic) {
      return {
        content: [{ type: 'text' as const, text: 'Indica un tema (topic) para buscar repositorios en GitHub.' }],
      };
    }
    const limit = args.limit != null ? Math.min(Math.max(1, args.limit), 30) : 10;
    const sort = args.sort ?? 'updated';
    const result = await searchGitHubRepos(topic, { limit, sort });
    if (!result.ok) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `[search_github_repos – error]\n\n${result.error ?? 'Error desconocido'}`,
          },
        ],
      };
    }
    const lines: string[] = [
      `Búsqueda: "${topic}" | Orden: ${sort} | Total en GitHub: ${result.total_count}`,
      '',
      ...result.repos.map((r, i) => {
        const desc = r.description ? `\n  ${r.description.slice(0, 200)}${r.description.length > 200 ? '…' : ''}` : '';
        const meta = [r.language && `Lang: ${r.language}`, `★ ${r.stargazers_count}`, `Fork: ${r.forks_count}`, `Actualizado: ${r.updated_at.slice(0, 10)}`].filter(Boolean).join(' | ');
        const topics = r.topics.length > 0 ? `\n  Topics: ${r.topics.slice(0, 8).join(', ')}` : '';
        return `[${i + 1}] ${r.full_name}\n  ${r.html_url}${desc}\n  ${meta}${topics}`;
      }),
    ];
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  },
);

mcpServer.tool(
  'repo_git',
  'Manipula el repositorio Git del workspace. Alias: hacer push, hacer commit, subir los cambios, ver estado del repo, etc. Acciones permitidas: status (ver estado), add (añadir archivos al stage), commit (crear commit; requiere message), push (subir al remoto), pull (traer del remoto). Por defecto opera en el directorio de trabajo del proceso (normalmente la raíz del proyecto abierto en el IDE). Opcionalmente pasa directory para otro repo.',
  {
    action: z.enum(['status', 'add', 'commit', 'push', 'pull']),
    message: z.string().optional(),
    directory: z.string().optional(),
    paths: z.string().optional(),
  } as any,
  async (args: { action: string; message?: string; directory?: string; paths?: string }) => {
    const action = (args.action || '').trim().toLowerCase();
    if (!['status', 'add', 'commit', 'push', 'pull'].includes(action)) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Acción no permitida: "${args.action}". Usa: status, add, commit, push o pull.`,
          },
        ],
      };
    }
    const result = runRepoGit({
      action: action as 'status' | 'add' | 'commit' | 'push' | 'pull',
      directory: args.directory?.trim() || undefined,
      message: args.message?.trim() || undefined,
      paths: args.paths?.trim() || undefined,
    });
    const text = result.ok
      ? `[repo_git ${action}]\n\n${result.output}`
      : `[repo_git ${action} – error]\n\n${result.error ?? result.output}`;
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

// ----- ClickUp (project manager): local e instancia -----
function clickUpError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

mcpServer.tool(
  'clickup_list_workspaces',
  'Lista los workspaces (teams) de ClickUp a los que tienes acceso. Úsala para encontrar el workspace MCP-SERVER o su team_id. Requiere CLICKUP_API_TOKEN en .env.',
  {} as any,
  async () => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN no está definido. Añade tu Personal API Token (pk_...) en .env o gateway/.env (local e instancia).' }] };
    }
    try {
      const teams = await getTeams();
      const lines = teams.length === 0
        ? ['Sin workspaces.']
        : teams.map((t) => `- id: ${t.id}  name: ${t.name ?? '(sin nombre)'}`);
      return { content: [{ type: 'text' as const, text: `Workspaces (${teams.length}):\n${lines.join('\n')}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error ClickUp: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_list_spaces',
  'Lista los spaces de un workspace ClickUp. Necesitas el team_id (de clickup_list_workspaces).',
  { team_id: z.string() } as any,
  async (args: { team_id: string }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN no está definido.' }] };
    }
    try {
      const spaces = await getSpaces(String(args.team_id).trim());
      const lines = spaces.length === 0
        ? ['Sin spaces.']
        : spaces.map((s) => `- id: ${s.id}  name: ${s.name ?? '(sin nombre)'}`);
      return { content: [{ type: 'text' as const, text: `Spaces (${spaces.length}):\n${lines.join('\n')}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error ClickUp: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_list_folders',
  'Lista los folders (y listas) de un space ClickUp. Necesitas el space_id.',
  { space_id: z.string() } as any,
  async (args: { space_id: string }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN no está definido.' }] };
    }
    try {
      const folders = await getFolders(String(args.space_id).trim());
      const lines = folders.length === 0
        ? ['Sin folders.']
        : folders.map((f) => `- id: ${f.id}  name: ${f.name ?? '(sin nombre)'}`);
      return { content: [{ type: 'text' as const, text: `Folders (${folders.length}):\n${lines.join('\n')}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error ClickUp: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_list_lists',
  'Lista las listas de un folder ClickUp (donde se crean tareas). Necesitas el folder_id.',
  { folder_id: z.string() } as any,
  async (args: { folder_id: string }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN no está definido.' }] };
    }
    try {
      const lists = await getLists(String(args.folder_id).trim());
      const lines = lists.length === 0
        ? ['Sin listas.']
        : lists.map((l) => `- id: ${l.id}  name: ${l.name ?? '(sin nombre)'}`);
      return { content: [{ type: 'text' as const, text: `Listas (${lists.length}):\n${lines.join('\n')}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error ClickUp: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_list_tasks',
  'Lista tareas de una lista ClickUp. Úsala para ver tickets o tareas del proyecto. Parámetros: list_id (requerido), status y archived opcionales.',
  {
    list_id: z.string(),
    status: z.string().optional(),
    archived: z.boolean().optional(),
  } as any,
  async (args: { list_id: string; status?: string; archived?: boolean }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN no está definido.' }] };
    }
    try {
      const tasks = await getTasks(String(args.list_id).trim(), {
        statuses: args.status?.trim(),
        archived: args.archived,
      });
      const lines = tasks.length === 0
        ? ['Sin tareas.']
        : tasks.map((t) => {
            const statusStr = t.status?.status ?? '';
            return `- id: ${t.id}  name: ${(t.name ?? '').slice(0, 60)}${(t.name?.length ?? 0) > 60 ? '…' : ''}  status: ${statusStr}`;
          });
      return { content: [{ type: 'text' as const, text: `Tareas (${tasks.length}):\n${lines.join('\n')}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error ClickUp: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_create_task',
  'Crea una tarea/ticket en una lista ClickUp. Úsala cuando el usuario pida crear un ticket o tarea. Requiere list_id y name; opcionales: description, status, priority.',
  {
    list_id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.number().optional(),
  } as any,
  async (args: { list_id: string; name: string; description?: string; status?: string; priority?: number }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN no está definido.' }] };
    }
    try {
      const body: CreateTaskBody = { name: String(args.name).trim() };
      if (args.description != null) body.description = String(args.description).trim();
      if (args.status != null) body.status = String(args.status).trim();
      if (args.priority != null) body.priority = Number(args.priority);
      const task = await createTask(String(args.list_id).trim(), body);
      return {
        content: [{ type: 'text' as const, text: `Tarea creada: id=${task.id}  name=${task.name ?? '(sin nombre)'}` }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error ClickUp: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_create_subtask',
  'Crea una subtarea bajo una tarea padre en ClickUp. Requiere list_id (misma lista que la tarea padre), parent_task_id y name; opcionales: description, status, priority.',
  {
    list_id: z.string(),
    parent_task_id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.number().optional(),
  } as any,
  async (args: { list_id: string; parent_task_id: string; name: string; description?: string; status?: string; priority?: number }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN no está definido.' }] };
    }
    try {
      const body: CreateTaskBody = { name: String(args.name).trim() };
      if (args.description != null) body.description = String(args.description).trim();
      if (args.status != null) body.status = String(args.status).trim();
      if (args.priority != null) body.priority = Number(args.priority);
      const task = await createSubtask(
        String(args.list_id).trim(),
        String(args.parent_task_id).trim(),
        body,
      );
      return {
        content: [{ type: 'text' as const, text: `Subtarea creada: id=${task.id}  name=${task.name ?? '(sin nombre)'}` }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error ClickUp: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_get_task',
  'Obtiene el detalle de una tarea ClickUp por task_id.',
  { task_id: z.string() } as any,
  async (args: { task_id: string }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN no está definido.' }] };
    }
    try {
      const task = await getTask(String(args.task_id).trim());
      const statusStr = task.status?.status ?? '';
      const text = [
        `id: ${task.id}`,
        `name: ${task.name ?? '(sin nombre)'}`,
        `status: ${statusStr}`,
        task.description ? `description: ${String(task.description).slice(0, 500)}${String(task.description).length > 500 ? '…' : ''}` : '',
      ].filter(Boolean).join('\n');
      return { content: [{ type: 'text' as const, text }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error ClickUp: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_update_task',
  'Actualiza una tarea ClickUp (estado, título, descripción, prioridad). Úsala para cerrar tickets, cambiar estado o editar. Requiere task_id; opcionales: name, description, status, priority.',
  {
    task_id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.number().optional(),
  } as any,
  async (args: { task_id: string; name?: string; description?: string; status?: string; priority?: number }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN no está definido.' }] };
    }
    try {
      const body: UpdateTaskBody = {};
      if (args.name != null) body.name = String(args.name).trim();
      if (args.description != null) body.description = String(args.description).trim();
      if (args.status != null) body.status = String(args.status).trim();
      if (args.priority != null) body.priority = Number(args.priority);
      const task = await updateTask(String(args.task_id).trim(), body);
      return {
        content: [{ type: 'text' as const, text: `Tarea actualizada: id=${task.id}  name=${task.name ?? '(sin nombre)'}` }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error ClickUp: ${clickUpError(err)}` }] };
    }
  },
);

  // ----- Azure DevOps (Work Items + TFVC changesets) -----
  function azureError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }

  mcpServer.tool(
    'azure',
    'Alias para Azure DevOps. Primer argumento: accion (ej. "listar tareas"). Segundo argumento opcional: usuario (ej. "gustavo grisales" o "ggrisales") para ver tareas asignadas a esa persona. Sin usuario: tareas asignadas a ti. Invocar: azure con accion="listar tareas" y opcional usuario="Gustavo Grisales".',
    {
      accion: z.string(),
      usuario: z.string().optional(),
    } as any,
    async (args: { accion: string; usuario?: string }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* no configurado en .env.' }] };
      }
      const accion = (args.accion || '').trim().toLowerCase();
      const usuario = args.usuario?.trim();
      if (accion === 'listar tareas' || accion === 'listar tareas asignadas' || accion === 'tareas') {
        try {
          const items = await listWorkItems({
            top: 50,
            assignedTo: usuario || undefined,
            assignedToMe: !usuario,
          });
          const who = usuario ? `asignados a "${usuario}"` : 'asignados a ti';
          const lines = items.length === 0
            ? [`No hay work items ${who}.`]
            : items.map((item) => {
                const f = item.fields || {};
                const changed = f['System.ChangedDate'] ? `  ${String(f['System.ChangedDate']).slice(0, 10)}` : '';
                return `#${item.id} [${f['System.WorkItemType'] ?? '?'}] (${f['System.State'] ?? '?'}) ${f['System.Title'] ?? '(sin título)'}${changed}`;
              });
          return { content: [{ type: 'text' as const, text: `Work Items ${who} (${items.length}):\n${lines.join('\n')}` }] };
        } catch (err) {
          return { content: [{ type: 'text' as const, text: `Error Azure DevOps: ${azureError(err)}` }] };
        }
      }
      return {
        content: [{ type: 'text' as const, text: `Acción "${args.accion}" no reconocida. Usa accion "listar tareas" y opcionalmente usuario "gustavo grisales".` }],
      };
    },
  );

  mcpServer.tool(
    'azure_list_work_items',
    'Lista work items (tickets/bugs/tareas) de Azure DevOps. Sin assigned_to: asignados a ti (@Me). Con assigned_to: asignados a ese usuario (ej. "Gustavo Grisales" o "ggrisales"). Filtros opcionales: type (Bug/Task), states (New,Committed,In Progress), year, top. Trae los asignados hasta la fecha. Requiere AZURE_DEVOPS_* en .env.',
    {
      type: z.string().optional(),
      states: z.string().optional(),
      year: z.number().optional(),
      top: z.number().optional(),
      assigned_to: z.string().optional(),
    } as any,
    async (args: { type?: string; states?: string; year?: number; top?: number; assigned_to?: string }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_BASE_URL, AZURE_DEVOPS_PROJECT y AZURE_DEVOPS_PAT deben estar definidos en .env.' }] };
      }
      try {
        const type = args.type?.trim();
        const states = args.states ? args.states.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
        const top = args.top ?? 50;
        const assignedTo = args.assigned_to?.trim();
        const items = await listWorkItems({
          type: type || undefined,
          states,
          year: args.year,
          top,
          assignedTo: assignedTo || undefined,
          assignedToMe: !assignedTo,
        });
        const who = assignedTo ? `asignados a "${assignedTo}"` : 'asignados a ti';
        const lines = items.length === 0
          ? [`No hay work items ${who} con esos filtros.`]
          : items.map((item) => {
              const f = item.fields || {};
              const changed = f['System.ChangedDate'] ? `  ${String(f['System.ChangedDate']).slice(0, 10)}` : '';
              return `#${item.id} [${f['System.WorkItemType'] ?? '?'}] (${f['System.State'] ?? '?'}) ${f['System.Title'] ?? '(sin título)'}${changed}`;
            });
        return { content: [{ type: 'text' as const, text: `Work Items ${who} (${items.length}):\n${lines.join('\n')}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error Azure DevOps: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_get_work_item',
    'Obtiene el detalle de un work item de Azure DevOps por ID. Requiere config Azure DevOps en .env.',
    { work_item_id: z.number() } as any,
    async (args: { work_item_id: number }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* no configurado en .env.' }] };
      }
      try {
        const wi = await getWorkItem(args.work_item_id);
        const f = wi.fields || {};
        const lines = [
          `#${wi.id} ${f['System.Title'] ?? '(sin título)'}`,
          `Type: ${f['System.WorkItemType'] ?? '?'}  State: ${f['System.State'] ?? '?'}`,
          `AssignedTo: ${(f['System.AssignedTo'] as { displayName?: string })?.displayName ?? f['System.AssignedTo'] ?? '?'}`,
          `Created: ${f['System.CreatedDate'] ?? '?'}  Changed: ${f['System.ChangedDate'] ?? '?'}`,
          `Area: ${f['System.AreaPath'] ?? '?'}  Iteration: ${f['System.IterationPath'] ?? '?'}`,
        ];
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error Azure DevOps: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_get_bug_changesets',
    'Lista los changesets (TFVC) vinculados a un bug/work item. Devuelve autor, fecha, comentario y archivos modificados por cada changeset. Requiere config Azure DevOps en .env.',
    { bug_id: z.number() } as any,
    async (args: { bug_id: number }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* no configurado en .env.' }] };
      }
      try {
        const wi = await getWorkItemWithRelations(args.bug_id);
        const title = (wi.fields || {})['System.Title'] ?? '(sin título)';
        const csIds = extractChangesetIds(wi);
        if (csIds.length === 0) {
          return { content: [{ type: 'text' as const, text: `Bug #${args.bug_id} - ${title}\nNo hay changesets vinculados (relations).` }] };
        }
        const blocks: string[] = [`Bug #${args.bug_id} - ${title}`, `Changesets: ${csIds.join(', ')}`, '---'];
        for (const csId of csIds) {
          const cs = await getChangeset(csId);
          const author = pickAuthor(cs);
          const comment = (cs.comment || '').trim();
          const date = cs.createdDate || cs.checkinDate || '';
          blocks.push(`\nChangeset ${csId}: ${author}  ${date}\nComment: ${comment}`);
          const ch = await getChangesetChanges(csId);
          const items = ch.value || [];
          blocks.push(`Files (${items.length}):`);
          for (const it of items) {
            const path = it.item?.path || it.item?.serverItem || '';
            blocks.push(`  [${it.changeType ?? '?'}] ${path}`);
          }
        }
        return { content: [{ type: 'text' as const, text: blocks.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error Azure DevOps: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_get_changeset',
    'Obtiene un changeset TFVC de Azure DevOps: autor, fecha, comentario y lista de archivos modificados. Requiere config Azure DevOps en .env.',
    { changeset_id: z.number() } as any,
    async (args: { changeset_id: number }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* no configurado en .env.' }] };
      }
      try {
        const cs = await getChangeset(args.changeset_id);
        const author = pickAuthor(cs);
        const lines = [
          `Changeset ${args.changeset_id}`,
          `Author: ${author}  Date: ${cs.createdDate || cs.checkinDate || ''}`,
          `Comment: ${(cs.comment || '').trim()}`,
          '---',
        ];
        const ch = await getChangesetChanges(args.changeset_id);
        const items = ch.value || [];
        lines.push(`Files (${items.length}):`);
        for (const it of items) {
          const path = it.item?.path || it.item?.serverItem || '';
          lines.push(`  [${it.changeType ?? '?'}] ${path}`);
        }
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error Azure DevOps: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_get_changeset_diff',
    'Muestra el diff (código cambiado) de un archivo en un changeset. Opcional: file_index (índice del archivo en la lista del changeset, 0 = primero). Requiere config Azure DevOps en .env.',
    {
      changeset_id: z.number(),
      file_index: z.number().optional(),
    } as any,
    async (args: { changeset_id: number; file_index?: number }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* no configurado en .env.' }] };
      }
      try {
        const ch = await getChangesetChanges(args.changeset_id);
        const items = ch.value || [];
        if (items.length === 0) {
          return { content: [{ type: 'text' as const, text: 'El changeset no tiene archivos modificados.' }] };
        }
        const idx = Math.max(0, Math.min(args.file_index ?? 0, items.length - 1));
        const tfvcPath = items[idx].item?.path || items[idx].item?.serverItem;
        if (!tfvcPath) {
          return { content: [{ type: 'text' as const, text: 'No se pudo obtener la ruta del archivo.' }] };
        }
        const { diff, prevCs, currentCs, isNewFile } = await getChangesetFileDiff(tfvcPath, args.changeset_id);
        const header = [
          `File: ${tfvcPath}`,
          isNewFile ? ' (archivo nuevo en este changeset)' : ` (diff ${prevCs} → ${currentCs})`,
          '---',
        ].join('\n');
        const diffLines = diff.map((op) => (op.t === '...' ? '...' : op.t + op.s));
        return { content: [{ type: 'text' as const, text: header + '\n' + diffLines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error Azure DevOps: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'list_tools',
    'Lista todas las herramientas MCP disponibles con su nombre y descripción. Úsala cuando el usuario pregunte qué herramientas hay, qué puede hacer el MCP o qué hace cada tool.',
    {} as any,
    async () => {
      const tools: { name: string; description: string }[] = [
        { name: 'search_docs', description: 'Busca en la documentación indexada del Knowledge Hub (Qdrant). Filtros opcionales: project, branch, source_type, domain, class_name, referenced_type, file_name.' },
        { name: 'count_docs', description: 'Devuelve cuántos documentos hay indexados en la colección de Qdrant (mcp_docs).' },
        { name: 'analize_code', description: 'Análisis de código con contexto de la BD: busca en Qdrant documentación relevante y devuelve fragmentos para que la IA analice con contexto.' },
        { name: 'index_url', description: 'Indexa el contenido de una URL en Qdrant. Opcional: project, render_js (SPA).' },
        { name: 'index_url_with_links', description: 'Indexa una URL y hasta max_links páginas enlazadas del mismo dominio.' },
        { name: 'index_site', description: 'Indexa todo un sitio desde una URL semilla (BFS). max_pages, render_js, skip_already_indexed.' },
        { name: 'write_flow_doc', description: 'Crea un documento markdown (nodo del mapa de flujos) en INDEX_INBOX_DIR. Parámetros: title, description; opcionales: files, functions, flow_summary, bug_id, project.' },
        { name: 'documentar_sesion', description: 'Guarda un documento Markdown de experiencia/sesión en la KB personal del usuario. Parámetros: title, content; opcionales: bugOrFeatureId, tags.' },
        { name: 'list_shared_dir', description: 'Lista directorios y archivos en el directorio compartido (SHARED_DIRS). relative_path opcional.' },
        { name: 'read_shared_file', description: 'Lee el contenido de un archivo en el directorio compartido. relative_path requerido.' },
        { name: 'list_url_links', description: 'Lista subenlaces y archivos de una URL (conteos y listas en Markdown).' },
        { name: 'view_url', description: 'Muestra el contenido de una URL en formato Markdown. Opcional: render_js (SPA).' },
        { name: 'mediawiki_login', description: 'Inicia sesión en un sitio MediaWiki. Para páginas protegidas con view_url, index_url, list_url_links.' },
        { name: 'search_github_repos', description: 'Búsqueda en GitHub por tema. Parámetros: topic; opcionales: limit, sort (updated|stars|forks).' },
        { name: 'repo_git', description: 'Manipula el repo Git del workspace: status, add, commit (message), push, pull. Opcional: directory, paths.' },
        { name: 'clickup_list_workspaces', description: 'Lista los workspaces (teams) de ClickUp. Requiere CLICKUP_API_TOKEN.' },
        { name: 'clickup_list_spaces', description: 'Lista los spaces de un workspace. team_id.' },
        { name: 'clickup_list_folders', description: 'Lista los folders de un space. space_id.' },
        { name: 'clickup_list_lists', description: 'Lista las listas de un folder. folder_id.' },
        { name: 'clickup_list_tasks', description: 'Lista tareas de una lista. list_id; opcionales: status, archived.' },
        { name: 'clickup_create_task', description: 'Crea una tarea en una lista. list_id, name; opcionales: description, status, priority.' },
        { name: 'clickup_create_subtask', description: 'Crea una subtarea bajo una tarea. list_id, parent_task_id, name; opcionales: description, status, priority.' },
        { name: 'clickup_get_task', description: 'Obtiene el detalle de una tarea. task_id.' },
        { name: 'clickup_update_task', description: 'Actualiza una tarea (estado, título, descripción, prioridad). task_id; opcionales: name, description, status, priority.' },
        { name: 'azure', description: 'Alias Azure DevOps: accion "listar tareas", opcional usuario "gustavo grisales". Sin usuario = tareas tuyas.' },
        { name: 'azure_list_work_items', description: 'Lista work items de Azure DevOps. Opcional assigned_to (ej. "Gustavo Grisales" o "ggrisales") para tareas de ese usuario; si no, asignados a ti. Opcionales: type, states, year, top.' },
        { name: 'azure_get_work_item', description: 'Obtiene el detalle de un work item. work_item_id.' },
        { name: 'azure_get_bug_changesets', description: 'Lista changesets TFVC vinculados a un bug. bug_id.' },
        { name: 'azure_get_changeset', description: 'Obtiene un changeset TFVC: autor, fecha, archivos. changeset_id.' },
        { name: 'azure_get_changeset_diff', description: 'Muestra el diff de un archivo en un changeset. changeset_id; opcional: file_index.' },
        { name: 'list_tools', description: 'Lista todas las herramientas MCP disponibles con su nombre y descripción.' },
      ];
      const lines = tools.map((t, i) => `${i + 1}. **${t.name}**\n   ${t.description}`);
      const text = `## Herramientas MCP disponibles (${tools.length})\n\n${lines.join('\n\n')}`;
      return {
        content: [{ type: 'text' as const, text }],
      };
    },
  );

  return mcpServer;
}

async function main() {
  const server = buildMcpServer({ userId: 'local' });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log a stderr para no interferir con el protocolo MCP en stdout
  console.error('MCP Knowledge Hub server running on stdio');
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
