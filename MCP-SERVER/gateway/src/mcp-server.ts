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
import { searchDocs, countDocs } from './search';
import { listSharedDir, readSharedFile, getSharedRootsForDisplay } from './shared-dirs';
import { indexUrl, indexUrlWithLinks, indexSite, listUrlLinks, formatListUrlLinksMarkdown, viewUrlContent, loginMediaWiki } from './url-indexer';
import { writeFlowDocToInbox } from './flow-doc';

/** Nombre del proyecto/hub (ej. "BlueIvory Beta"). Opcional, para mostrar en respuestas. */
const KNOWLEDGE_HUB_NAME = (process.env.KNOWLEDGE_HUB_NAME || process.env.PROJECT_NAME || '').trim();

const mcpServer = new McpServer({
  name: 'mcp-knowledge-hub',
  version: '0.1.0',
});

mcpServer.tool(
  'search_docs',
  'Busca en la documentación indexada del Knowledge Hub (Qdrant). Usa esta herramienta cuando necesites información de la documentación del proyecto, ADRs, bugs, flujos o docs corporativos.',
  { query: z.string(), limit: z.number().optional() } as any,
  async (args: { query: string; limit?: number }) => {
    const query = args.query ?? '';
    const limit = args.limit ?? 10;
    const maxResults = Math.min(Math.max(1, limit), 100);
    const { results, total } = await searchDocs(query, maxResults);
    const header = KNOWLEDGE_HUB_NAME ? `[${KNOWLEDGE_HUB_NAME}] ` : '';
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
          text: `${header}Búsqueda: "${query}" (${total} resultado(s))\n\n${text}`,
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
    limit: z.number().optional(),
  } as any,
  async (args: {
    description: string;
    component?: string;
    project?: string;
    limit?: number;
  }) => {
    const description = (args.description || '').trim();
    const component = (args.component || '').trim();
    const project = (args.project || '').trim();
    const limit = Math.min(Math.max(1, args.limit ?? 15), 30);
    const queryParts = [description];
    if (component) queryParts.push(component);
    const query = queryParts.join(' ');
    const { count } = await countDocs();
    const { results, total } = await searchDocs(query, limit, project ? { project } : undefined);
    const hubName = KNOWLEDGE_HUB_NAME ? ` – ${KNOWLEDGE_HUB_NAME}` : '';
    const projectInfo = project ? ` | Proyecto: ${project}` : '';
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
  'Indexa el contenido de una URL en Qdrant (Knowledge Hub). Obtiene la página, convierte HTML a texto y lo guarda en mcp_docs. Si la URL ya existía, se actualiza. Úsala para añadir documentación o páginas importantes desde internet.',
  { url: z.string() } as any,
  async (args: { url: string }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL debe comenzar con http:// o https://' }],
      };
    }
    const result = await indexUrl(url);
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
  'Indexa una URL y hasta max_links páginas enlazadas del mismo dominio (documentación, FAQ, etc.). Úsala para indexar un sitio y sus subpáginas relacionadas.',
  { url: z.string(), max_links: z.number().optional() } as any,
  async (args: { url: string; max_links?: number }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL debe comenzar con http:// o https://' }],
      };
    }
    const maxLinks = Math.min(Math.max(0, args.max_links ?? 20), 50);
    const result = await indexUrlWithLinks(url, maxLinks);
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
  'Indexa todo un sitio desde una URL semilla: recorre enlaces del mismo dominio (BFS) hasta indexar max_pages páginas. Úsala para indexar documentación completa (ej. wiki o dev center).',
  { url: z.string(), max_pages: z.number().optional() } as any,
  async (args: { url: string; max_pages?: number }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL debe comenzar con http:// o https://' }],
      };
    }
    const maxPages = Math.min(Math.max(1, args.max_pages ?? 1000), 10000);
    const result = await indexSite(url, maxPages);
    const lines = [
      `Indexadas: ${result.indexed} páginas.`,
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
  'Muestra el contenido de una URL en formato Markdown (título, texto y bloques de código con ```). En MediaWiki solo se devuelve el artículo (.mw-parser-output), sin menús ni pie. Siempre presenta al usuario el contenido completo que devuelve la herramienta, con secciones y código formateado. Úsala para ver una página: ver url, inspeccionar url.',
  { url: z.string() } as any,
  async (args: { url: string }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL debe comenzar con http:// o https://' }],
      };
    }
    const result = await viewUrlContent(url);
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

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  // Log a stderr para no interferir con el protocolo MCP en stdout
  console.error('MCP Knowledge Hub server running on stdio');
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
