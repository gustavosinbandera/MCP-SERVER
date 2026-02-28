export type ToolArgHelp = {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  enum?: string[];
};

export type ToolExample = {
  title: string;
  /** Arguments object passed to the tool. */
  args: Record<string, unknown>;
};

export type ToolCatalogEntry = {
  name: string;
  description: string;
  args?: ToolArgHelp[];
  examples?: ToolExample[];
  notes?: string[];
};

/**
 * Human-oriented catalog for MCP tools.
 * This is used both by:
 * - MCP tool `list_tools` (markdown list)
 * - Webapp help page via gateway REST endpoints
 */
export const MCP_TOOLS_CATALOG: ToolCatalogEntry[] = [
  {
    name: 'search_docs',
    description:
      'Busca en la documentación indexada del Knowledge Hub (Qdrant). Filtros opcionales: project, branch, source_type, domain, class_name, referenced_type, file_name.',
    args: [
      { name: 'query', type: 'string', required: true, description: 'Texto a buscar (semántico).' },
      { name: 'limit', type: 'number', required: false, description: 'Máximo de resultados (1–100).' },
      { name: 'project', type: 'string', required: false },
      { name: 'branch', type: 'string', required: false },
      { name: 'source_type', type: 'string', required: false, description: 'Ej: code | doc | url.' },
      { name: 'domain', type: 'string', required: false },
      { name: 'class_name', type: 'string', required: false },
      { name: 'referenced_type', type: 'string', required: false },
      { name: 'file_name', type: 'string', required: false },
    ],
    examples: [
      { title: 'Búsqueda simple', args: { query: 'explorador de archivos', limit: 10 } },
      { title: 'Filtrando por proyecto', args: { query: 'nginx upstream', project: 'mcp-server', limit: 8 } },
    ],
  },
  { name: 'count_docs', description: 'Devuelve cuántos documentos hay indexados en la colección de Qdrant (mcp_docs).' },
  {
    name: 'analize_code',
    description:
      'Análisis de código con contexto de la BD: busca en Qdrant documentación relevante y devuelve fragmentos para análisis.',
    args: [
      { name: 'description', type: 'string', required: true, description: 'Descripción del bug/feature a investigar.' },
      { name: 'component', type: 'string', required: false },
      { name: 'limit', type: 'number', required: false, description: 'Resultados relevantes (1–30).' },
      { name: 'project', type: 'string', required: false },
      { name: 'branch', type: 'string', required: false },
      { name: 'source_type', type: 'string', required: false },
      { name: 'domain', type: 'string', required: false },
      { name: 'class_name', type: 'string', required: false },
      { name: 'referenced_type', type: 'string', required: false },
      { name: 'file_name', type: 'string', required: false },
    ],
    examples: [
      { title: 'Bug con componente', args: { description: '502 Bad Gateway en nginx', component: 'nginx', limit: 15 } },
    ],
  },
  {
    name: 'index_url',
    description: 'Indexa el contenido de una URL en Qdrant. Opcional: project, render_js (SPA).',
    args: [
      { name: 'url', type: 'string', required: true },
      { name: 'render_js', type: 'boolean', required: false },
      { name: 'project', type: 'string', required: false },
    ],
    examples: [{ title: 'Indexar una URL', args: { url: 'https://example.com/docs', render_js: false } }],
  },
  {
    name: 'index_url_with_links',
    description: 'Indexa una URL y hasta max_links páginas enlazadas del mismo dominio.',
    args: [
      { name: 'url', type: 'string', required: true },
      { name: 'max_links', type: 'number', required: false },
      { name: 'render_js', type: 'boolean', required: false },
    ],
  },
  {
    name: 'index_site',
    description:
      'Indexa todo un sitio desde una URL semilla (BFS). max_pages, render_js, skip_already_indexed.',
    args: [
      { name: 'url', type: 'string', required: true },
      { name: 'max_pages', type: 'number', required: false },
      { name: 'render_js', type: 'boolean', required: false },
      { name: 'skip_already_indexed', type: 'boolean', required: false },
    ],
  },
  {
    name: 'write_flow_doc',
    description:
      'Crea un documento markdown (nodo del mapa de flujos) en INDEX_INBOX_DIR. Parámetros: title, description; opcionales: files, functions, flow_summary, bug_id, project.',
    args: [
      { name: 'title', type: 'string', required: true },
      { name: 'description', type: 'string', required: true },
      { name: 'files', type: 'string', required: false },
      { name: 'functions', type: 'string', required: false },
      { name: 'flow_summary', type: 'string', required: false },
      { name: 'bug_id', type: 'string', required: false },
      { name: 'project', type: 'string', required: false },
    ],
    examples: [
      {
        title: 'Crear nodo de flujo',
        args: { title: 'Flujo: descarga archivos', description: 'Resumen del endpoint /files/download', project: 'mcp-server' },
      },
    ],
  },
  {
    name: 'documentar_sesion',
    description:
      'Guarda un documento Markdown de experiencia/sesión en la KB personal del usuario. Parámetros: title, content; opcionales: bugOrFeatureId, tags.',
    args: [
      { name: 'title', type: 'string', required: true },
      { name: 'content', type: 'string', required: true },
      { name: 'bugOrFeatureId', type: 'string', required: false },
      { name: 'tags', type: 'string[]', required: false },
    ],
  },
  {
    name: 'list_shared_dir',
    description: 'Lista directorios y archivos en el directorio compartido (SHARED_DIRS). relative_path opcional.',
    args: [{ name: 'relative_path', type: 'string', required: false }],
    examples: [{ title: 'Raíz compartida', args: { relative_path: '' } }],
  },
  {
    name: 'read_shared_file',
    description: 'Lee el contenido de un archivo en el directorio compartido. relative_path requerido.',
    args: [{ name: 'relative_path', type: 'string', required: true }],
    examples: [{ title: 'Leer archivo', args: { relative_path: 'readme.txt' } }],
  },
  { name: 'list_url_links', description: 'Lista subenlaces y archivos de una URL (conteos y listas en Markdown).' },
  { name: 'view_url', description: 'Muestra el contenido de una URL en formato Markdown. Opcional: render_js (SPA).' },
  { name: 'mediawiki_login', description: 'Inicia sesión en un sitio MediaWiki. Para páginas protegidas con view_url, index_url, list_url_links.' },
  {
    name: 'search_github_repos',
    description: 'Búsqueda en GitHub por tema. Parámetros: topic; opcionales: limit, sort (updated|stars|forks).',
    args: [
      { name: 'topic', type: 'string', required: true },
      { name: 'limit', type: 'number', required: false },
      { name: 'sort', type: 'string', required: false, enum: ['updated', 'stars', 'forks'] },
    ],
  },
  {
    name: 'repo_git',
    description:
      'Manipula el repo Git del workspace: status, add, commit (message), push, pull. Opcional: directory, paths.',
    args: [
      { name: 'action', type: 'string', required: true, enum: ['status', 'add', 'commit', 'push', 'pull'] },
      { name: 'message', type: 'string', required: false },
      { name: 'directory', type: 'string', required: false },
      { name: 'paths', type: 'string', required: false, description: 'Ej: "gateway/src/index.ts webapp/src/app/page.tsx"' },
    ],
    examples: [{ title: 'Ver estado', args: { action: 'status' } }],
    notes: ['Esta tool puede modificar el repo (commit/push). Úsala con cuidado.'],
  },
  { name: 'repo_pull', description: 'Hace git pull en el repo del workspace. Opcional: directory.' },
  { name: 'instance_update', description: 'Devuelve el comando SSH para actualizar la instancia (pull, build, up, restart, health).' },
  { name: 'instance_report', description: 'Devuelve el comando SSH para ver el estado de la instancia (contenedores, health).' },
  { name: 'instance_reboot', description: 'Devuelve el comando SSH para reiniciar todos los servicios de la instancia.' },
  { name: 'clickup_list_workspaces', description: 'Lista workspaces (teams) de ClickUp. Requiere CLICKUP_API_TOKEN.' },
  { name: 'clickup_list_spaces', description: 'Lista spaces de un workspace. team_id.' },
  { name: 'clickup_list_folders', description: 'Lista folders de un space. space_id.' },
  { name: 'clickup_list_lists', description: 'Lista listas de un folder. folder_id.' },
  { name: 'clickup_list_tasks', description: 'Lista tareas de una lista. list_id; opcionales: status, archived.' },
  { name: 'clickup_create_task', description: 'Crea una tarea en una lista. list_id, name; opcionales: description, status, priority.' },
  { name: 'clickup_create_subtask', description: 'Crea una subtarea bajo una tarea. list_id, parent_task_id, name; opcionales.' },
  { name: 'clickup_get_task', description: 'Obtiene el detalle de una tarea. task_id.' },
  { name: 'clickup_update_task', description: 'Actualiza una tarea. task_id; opcionales: name, description, status, priority.' },
  { name: 'azure', description: 'Alias Azure DevOps: accion "listar tareas", opcional usuario. Sin usuario = tareas tuyas.' },
  {
    name: 'azure_list_work_items',
    description:
      'Lista work items de Azure DevOps. Opcional assigned_to; si no, asignados a ti. Opcionales: type, states, year, top.',
    args: [
      { name: 'type', type: 'string', required: false, description: 'Ej: Bug | Task' },
      { name: 'states', type: 'string', required: false, description: 'CSV: "New,Committed,In Progress"' },
      { name: 'year', type: 'number', required: false },
      { name: 'top', type: 'number', required: false },
      { name: 'assigned_to', type: 'string', required: false },
    ],
    examples: [{ title: 'Top 10 asignados a mí', args: { top: 10 } }],
  },
  { name: 'azure_get_work_item', description: 'Obtiene el detalle de un work item. work_item_id.' },
  { name: 'azure_get_work_item_updates', description: 'Historial de actualizaciones (logs) de un work item. work_item_id; top opcional.' },
  {
    name: 'azure_add_work_item_comment',
    description: 'Añade un comentario (Markdown) a un work item (Discussion / System.History). work_item_id, comment_text.',
    args: [
      { name: 'work_item_id', type: 'number', required: true },
      { name: 'comment_text', type: 'string', required: true },
    ],
    examples: [
      { title: 'Comentar en bug', args: { work_item_id: 123456, comment_text: 'Resumen de diagnóstico...\n\n- Paso 1\n- Paso 2' } },
    ],
  },
  { name: 'azure_bug_analysis_or_solution', description: 'Genera analysis/solution (en inglés) para un bug y lo postea al work item. Requiere OPENAI_API_KEY.' },
  { name: 'azure_get_bug_changesets', description: 'Lista changesets TFVC vinculados a un bug. bug_id.' },
  { name: 'azure_get_changeset', description: 'Obtiene un changeset TFVC: autor, fecha, archivos. changeset_id.' },
  { name: 'azure_get_changeset_diff', description: 'Muestra diff de un archivo en un changeset. changeset_id; file_index opcional.' },
  { name: 'azure_count_changesets', description: 'Cuenta changesets TFVC con filtros. project, author, from_date, to_date, max_count.' },
  { name: 'azure_list_changesets', description: 'Lista changesets TFVC con filtros. project, author, from_date, to_date, top (pagina internamente).' },
  { name: 'azure_list_changeset_authors', description: 'Lista autores con changesets. project opcional; max_scan opcional.' },
  { name: 'list_tools', description: 'Lista todas las herramientas MCP disponibles con su nombre y descripción.' },
];

export function getMcpToolsCatalog(): ToolCatalogEntry[] {
  return [...MCP_TOOLS_CATALOG].sort((a, b) => a.name.localeCompare(b.name));
}

export function getMcpToolByName(name: string): ToolCatalogEntry | undefined {
  const n = String(name || '').trim();
  if (!n) return undefined;
  return MCP_TOOLS_CATALOG.find((t) => t.name === n);
}

