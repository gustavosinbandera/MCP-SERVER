/**
 * MCP Knowledge Hub - MCP Server (stdio)
 * IDEs (Cursor, VS Code, etc.) connect via an MCP client and the AI uses the search_docs tool.
 * Run: node dist/mcp-server.js (the IDE usually starts this process and communicates over stdin/stdout).
 * Env: loaded from gateway/.env (fixed path relative to dist/mcp-server.js so it works even if cwd is not gateway).
 */

import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
  listWorkItemsByDateRange,
  listWorkItemsByDateRangePaginated,
  getWorkItem,
  getWorkItemWithRelations,
  getWorkItemUpdates,
  extractChangesetIds,
  listChangesets,
  listChangesetsByItemPath,
  listGitRepositories,
  listTfvcItems,
  listChangesetAuthors,
  getChangesetCount,
  getChangeset,
  getChangesetChanges,
  getChangesetFileDiff,
  getTfvcItemTextAtChangeset,
  pickAuthor,
  updateWorkItemFields,
  addWorkItemCommentAsMarkdown,
  collectChangesetsForPaths,
  ingestRowsToRemotePostgres,
} from './azure';
import {
  workItemToCompact,
  workItemSummaryLines,
  workItemToListItem,
  normalizeUpdates,
  updatesSummaryText,
  formatMcpContent,
  formatMcpErrorContent,
  toAzureErrorEnvelope,
  type WorkItemUpdateEvent,
  type AzureSuccessEnvelope,
} from './azure/response-envelope';
import { findRelevantCode } from './bug-search-code';
import { generatePossibleCauseEnglish, generateSolutionDescriptionEnglish, hasOpenAIForBugs } from './bug-solution-llm';
import { parseFileWithTreeSitter, TREE_SITTER_V2_DELIMITER } from './tree-sitter-tool';
import { runSemgrepScan, SEMGREP_V2_DELIMITER } from './semgrep-tool';
import { runGrepCode } from './tools/grep-code';
import { runGrepSymbols } from './tools/grep-symbols';
import { runReadFileRegion } from './tools/read-file-region';
import { info as logInfo } from './logger';
import { getMcpToolsCatalog } from './mcp/tools-catalog';

/** Optional hub/project name (e.g. "BlueIvory Beta") shown in responses. */
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
 * Factory: creates an McpServer with the full tool set.
 * ctx.userId is used for per-user paths/payloads (e.g. User KB).
 * Stdio mode: buildMcpServer({ userId: 'local' }).
 */
export function buildMcpServer(ctx: McpContext): McpServer {
  const mcpServer = new McpServer({
    name: 'mcp-knowledge-hub',
    version: '0.1.0',
  });

  type IngestJob = {
    job_id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    created_at: string;
    started_at?: string;
    finished_at?: string;
    error?: string;
    mode: 'bootstrap' | 'daily';
    params: Record<string, unknown>;
    progress: {
      stage: string;
      percent: number;
      message?: string;
      changesets_seen?: number;
      changesets_total_estimate?: number;
      files_seen?: number;
      work_item_links_seen?: number;
    };
    result?: {
      ingested_changesets: number;
      ingested_files: number;
      ingested_work_item_links: number;
      distinct_work_items: number;
    };
  };
  const ingestJobs = new Map<string, IngestJob>();
  const nowIso = () => new Date().toISOString();
  const toPercent = (stage: string, seen?: number, total?: number): number => {
    if (stage === 'done') return 100;
    if (!total || total <= 0 || !seen || seen <= 0) {
      if (stage === 'collecting') return 5;
      if (stage === 'enriching') return 35;
      if (stage === 'preparing_sql') return 70;
      if (stage === 'writing_remote') return 92;
      return 0;
    }
    if (stage === 'collecting') return Math.min(30, Math.floor((seen / total) * 30));
    if (stage === 'enriching') return 30 + Math.min(35, Math.floor((seen / total) * 35));
    if (stage === 'preparing_sql') return 65 + Math.min(25, Math.floor((seen / total) * 25));
    if (stage === 'writing_remote') return 95;
    return 0;
  };

  mcpServer.tool(
  'search_docs',
  'Search indexed Knowledge Hub documentation (Qdrant). Optional filters (aligned with the indexed payload): project, branch (classic|blueivory), source_type (code|doc|url), domain, class_name (class containing the doc), referenced_type (referenced type), file_name. Use this tool when you need information from project documentation, ADRs, bugs, flows, or corporate docs.',
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
    const filterInfo = opts ? ` Filters: ${formatFilterInfo(opts)}` : '';
    const text =
      results.length === 0
        ? `No results for "${query}".`
        : results
            .map(
              (r, i) =>
                `[${i + 1}] ${(r.payload?.title as string) || 'Untitled'}\n${(r.payload?.content as string) || ''}`,
            )
            .join('\n\n---\n\n');
    return {
      content: [
        {
          type: 'text' as const,
          text: `${header}Search: "${query}" (${total} result(s))${filterInfo}\n\n${text}`,
        },
      ],
    };
  },
);

mcpServer.tool(
  'count_docs',
  'Return the number of documents indexed in the Qdrant collection (mcp_docs). Use this when you need the total document count in the Knowledge Hub.',
  {} as any,
  async () => {
    const { count, collection } = await countDocs();
    const projectLine = KNOWLEDGE_HUB_NAME ? `Project: ${KNOWLEDGE_HUB_NAME}\n` : '';
    const text = `${projectLine}Collection: ${collection}\nIndexed documents: ${count}`;
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

mcpServer.tool(
  'analize_code',
  'Code analysis with DB context: given a description (bug, feature, component), search the Knowledge Hub (Qdrant) for relevant docs and return the doc count + excerpts so the AI can analyze with context. Use this when the user asks to analyze code, reports a bug, or needs context from indexed documentation.',
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
    const projectInfo = opts?.project ? ` | Project: ${opts.project}` : opts ? ` | Filters: ${formatFilterInfo(opts)}` : '';
    const header = [
      `[CODE ANALYSIS${hubName} – context from the DB]`,
      `Collection: mcp_docs | Total indexed documents: ${count}${projectInfo}`,
      `Query: "${query}" → ${total} relevant result(s)`,
      ``,
    ].join('\n');
    const body =
      results.length === 0
        ? `No documents in the DB match the description. Consider indexing more documentation (index_url, index_site) or expanding the description.`
        : results
            .map((r, i) => {
              const title = (r.payload?.title as string) || 'Untitled';
              const url = r.payload?.url as string | undefined;
              const sourcePath = r.payload?.source_path as string | undefined;
              const proj = r.payload?.project as string | undefined;
              const meta = [url && `URL: ${url}`, sourcePath && `Path: ${sourcePath}`, proj && `Project: ${proj}`]
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
  'Index the content of a URL into Qdrant (Knowledge Hub). Fetches the page, converts HTML to text, and stores it in mcp_docs. If the URL already exists, it is updated. Optional project (e.g. magaya-help) can be used later to filter by source_type=url. For SPA pages use render_js: true. Use this to add important documentation or pages from the internet.',
  { url: z.string(), render_js: z.boolean().optional(), project: z.string().optional() } as any,
  async (args: { url: string; render_js?: boolean; project?: string }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL must start with http:// or https://' }],
      };
    }
    const result = await indexUrl(url, { renderJs: args.render_js, project: args.project?.trim() });
    if (result.indexed) {
      return {
        content: [{ type: 'text' as const, text: `URL indexed: ${result.title}\n${url}` }],
      };
    }
    return {
      content: [{ type: 'text' as const, text: `Failed to index ${url}: ${result.error ?? 'unknown'}` }],
    };
  },
);

mcpServer.tool(
  'index_url_with_links',
  'Index a URL and up to max_links linked pages from the same domain (docs, FAQ, etc.). For SPA sites (e.g. help.magaya.com) use render_js: true. Use this to index a site and its related subpages.',
  { url: z.string(), max_links: z.number().optional(), render_js: z.boolean().optional() } as any,
  async (args: { url: string; max_links?: number; render_js?: boolean }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL must start with http:// or https://' }],
      };
    }
    const maxLinks = Math.min(Math.max(0, args.max_links ?? 20), 50);
    const result = await indexUrlWithLinks(url, maxLinks, { renderJs: args.render_js });
    const lines = [
      `Indexed: ${result.indexed}/${result.total} pages.`,
      result.urls.length > 0 ? `URLs: ${result.urls.join(', ')}` : '',
      result.errors.length > 0 ? `Errors: ${result.errors.join('; ')}` : '',
    ].filter(Boolean);
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  },
);

mcpServer.tool(
  'index_site',
  'Index an entire site starting from a seed URL: crawls same-domain links (BFS) up to max_pages pages. With skip_already_indexed: true, it only indexes new URLs and skips those already in Qdrant (useful to resume without reindexing). For SPA sites (e.g. help.magaya.com) use render_js: true.',
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
        content: [{ type: 'text' as const, text: 'URL must start with http:// or https://' }],
      };
    }
    const maxPages = Math.min(Math.max(1, args.max_pages ?? 1000), 20000);
    const result = await indexSite(url, maxPages, {
      renderJs: args.render_js,
      skipAlreadyIndexed: args.skip_already_indexed,
    });
    const lines = [
      `Indexed: ${result.indexed} pages.`,
      result.skipped > 0 ? `Skipped (already indexed): ${result.skipped} pages.` : '',
      result.urls.length > 0 ? `URLs (first 20): ${result.urls.slice(0, 20).join(', ')}${result.urls.length > 20 ? '...' : ''}` : '',
      result.errors.length > 0 ? `Errors (first 5): ${result.errors.slice(0, 5).join('; ')}` : '',
    ].filter(Boolean);
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  },
);

mcpServer.tool(
  'write_flow_doc',
  'Create a Markdown document (a flow-map node) and save it to INDEX_INBOX_DIR so the supervisor can index it. When to use it: (1) If the user says "usar-mcp": create the document and start adding information that helps build a map of how the code connects (files, functions, flow description). (2) If you use a code-analysis / flow-review tool (analize_code, search_docs) and get relevant results: also create and store the document. AI-generated docs include frontmatter fields generated_by_ia: true and source: ai_generated to explicitly identify them. Params: title, description; optional: files, functions, flow_summary, bug_id, project.',
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
  'Save a Markdown experience/session document in the user personal KB (persistent; not deleted). It is indexed in Qdrant with owner_user_id and doc_kind "experience". Use this to document sessions, findings, bugs, or features. Params: title, content (markdown); optional: bugOrFeatureId, tags (array of strings).',
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
        content: [{ type: 'text' as const, text: `Failed to save: ${result.error}` }],
      };
    }
    return {
      content: [{ type: 'text' as const, text: result.message }],
    };
  },
);

mcpServer.tool(
  'list_shared_dir',
  'List directories and files in a shared directory (no indexing). Use empty relative_path for the root of the first shared directory (SHARED_DIRS).',
  { relative_path: z.string().optional() } as any,
  async (args: { relative_path?: string }) => {
    const roots = getSharedRootsForDisplay();
    if (roots.length === 0) {
      const envVal = process.env.SHARED_DIRS;
      const diag =
        envVal === undefined
          ? ' (variable not set in the process)'
          : envVal === ''
            ? ' (variable is empty)'
            : ` (received value: "${envVal}")`;
      return {
        content: [
          {
            type: 'text' as const,
            text: `No shared directories are configured. SHARED_DIRS is empty or invalid${diag}. Check .cursor/mcp.json and restart Cursor.`,
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
            text: `Could not list "${relativePath || '(root)'}" in ${roots[0]}. Invalid path or does not exist.`,
          },
        ],
      };
    }
    const pathLabel = relativePath ? relativePath : '(root)';
    const text = `Shared directory: ${result.root}\nPath: ${pathLabel}\n\nEntries:\n${result.entries.join('\n')}`;
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

mcpServer.tool(
  'read_shared_file',
  'Read the contents of a file inside the shared directory (no indexing). Pass the relative path to the file (e.g. "readme.txt" or "src/index.js").',
  { relative_path: z.string() } as any,
  async (args: { relative_path: string }) => {
    const roots = getSharedRootsForDisplay();
    if (roots.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No shared directories are configured (SHARED_DIRS is empty).',
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
            text: `Could not read "${args.relative_path}" in ${roots[0]}. Invalid path, it does not exist, or it is not a file.`,
          },
        ],
      };
    }
    const text = `File: ${result.path}\n\n---\n\n${result.content}`;
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

mcpServer.tool(
  'list_url_links',
  'List how many sub-links and files a URL contains. Fetches the page, extracts all hrefs, and returns counts and lists in Markdown. Use this to inspect remote links, list URLs within a page, or list referenced files.',
  { url: z.string() } as any,
  async (args: { url: string }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL must start with http:// or https://' }],
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
  'Show the content of a URL in Markdown format (title, text, and code blocks with ```). For MediaWiki, only the article (.mw-parser-output) is returned (no menus/footer). For pages that load content via JavaScript (SPA, e.g. help.magaya.com), use render_js: true to open the URL in a headless browser and get rendered HTML. Use this to inspect a page: view url, inspect url.',
  { url: z.string(), render_js: z.boolean().optional() } as any,
  async (args: { url: string; render_js?: boolean }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: 'URL must start with http:// or https://' }],
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
  'Log into a MediaWiki site (fetches a login token via API and stores the session in cookies). Uses INDEX_URL_USER and INDEX_URL_PASSWORD from gateway/.env. After a successful login, view_url, index_url, and list_url_links can access protected pages on that site. Use this when a URL requires login: mediawiki login, sign in, login url.',
  { url: z.string() } as any,
  async (args: { url: string }) => {
    const url = (args.url || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        content: [{ type: 'text' as const, text: '## Error\n\nThe URL (or origin) must start with http:// or https://' }],
      };
    }
    const result = await loginMediaWiki(url);
    const title = result.success ? 'Signed in' : 'Login failed';
    const text = `## ${title}\n\n${result.message}`;
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

mcpServer.tool(
  'search_github_repos',
  'GitHub SEARCH ONLY: list existing repositories by topic (does not create repos, does not write scripts). When the user says "search on GitHub X", "repos about X", "find esp32/mcp repos", use this tool and return results; do not create repos or code. Params: topic (e.g. esp32, MCP server), optional limit (max 30), optional sort (updated | stars | forks).',
  {
    topic: z.string(),
    limit: z.number().optional(),
    sort: z.enum(['updated', 'stars', 'forks']).optional(),
  } as any,
  async (args: { topic: string; limit?: number; sort?: 'updated' | 'stars' | 'forks' }) => {
    const topic = (args.topic ?? '').trim();
    if (!topic) {
      return {
        content: [{ type: 'text' as const, text: 'Provide a topic to search repositories on GitHub.' }],
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
            text: `[search_github_repos – error]\n\n${result.error ?? 'Unknown error'}`,
          },
        ],
      };
    }
    const lines: string[] = [
      `Query: "${topic}" | Sort: ${sort} | Total on GitHub: ${result.total_count}`,
      '',
      ...result.repos.map((r, i) => {
        const desc = r.description ? `\n  ${r.description.slice(0, 200)}${r.description.length > 200 ? '…' : ''}` : '';
        const meta = [r.language && `Lang: ${r.language}`, `★ ${r.stargazers_count}`, `Fork: ${r.forks_count}`, `Updated: ${r.updated_at.slice(0, 10)}`].filter(Boolean).join(' | ');
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
  'Operate on the workspace Git repository. Aliases: push, commit, upload changes, view repo status, etc. Allowed actions: status (show status), add (stage files), commit (create a commit; requires message), push (push to remote), pull (pull from remote). By default it operates in the process working directory (usually the opened project root in the IDE). Optionally pass directory to target a different repo.',
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
            text: `Action not allowed: "${args.action}". Use: status, add, commit, push, or pull.`,
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

mcpServer.tool(
  'repo_pull',
  'Run git pull in the workspace repository (fetch changes from remote). Optional: directory to target a different repo.',
  {
    directory: z.string().optional(),
  } as any,
  async (args: { directory?: string }) => {
    const result = runRepoGit({
      action: 'pull',
      directory: args.directory?.trim() || undefined,
    });
    const text = result.ok
      ? `[repo_pull]\n\n${result.output}`
      : `[repo_pull – error]\n\n${result.error ?? result.output}`;
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

mcpServer.tool(
  'instance_update',
  'Return the SSH command to update the instance: on the instance it runs git pull, build, up, restart, and health verification (up to 3 attempts; if it fails, it reverts). It does not add/commit/push in your local repo. Configure INSTANCE_SSH_TARGET and INSTANCE_SSH_KEY_PATH in .env.',
  {} as any,
  async () => {
    const host = process.env.INSTANCE_SSH_TARGET?.trim() || 'ec2-user@100.27.211.19';
    const keyPath = process.env.INSTANCE_SSH_KEY_PATH?.trim() || 'infra/mcp-server-key.pem';
    const cmd = "cd ~/MCP-SERVER && bash scripts/ec2/instance_update_with_verify.sh";
    const sshPart = keyPath ? `ssh -i "${keyPath}" ${host}` : `ssh ${host}`;
    const fullCommand = `${sshPart} "${cmd.replace(/"/g, '\\"')}"`;

    const text = [
      '[instance_update] Run this command in your terminal (from the repo root):',
      '',
      fullCommand,
      '',
      `Host: ${host} | Key: ${keyPath}`,
      '',
      'On the instance it runs: git pull, build gateway/supervisor, up -d, restart, and health verification. If you already pushed your changes, the pull will bring them.',
    ].join('\n');

    return { content: [{ type: 'text' as const, text }] };
  },
);

function instanceSshCommand(remoteCmd: string, title: string): string {
  const host = process.env.INSTANCE_SSH_TARGET?.trim() || 'ec2-user@100.27.211.19';
  const keyPath = process.env.INSTANCE_SSH_KEY_PATH?.trim() || 'infra/mcp-server-key.pem';
  const sshPart = keyPath ? `ssh -i "${keyPath}" ${host}` : `ssh ${host}`;
  const fullCommand = `${sshPart} "${remoteCmd.replace(/"/g, '\\"')}"`;
  return [
    `[${title}] Run this command in your terminal (from the repo root):`,
    '',
    fullCommand,
    '',
    `Host: ${host} | Key: ${keyPath}`,
  ].join('\n');
}

mcpServer.tool(
  'instance_report',
  'Return the SSH command to view instance status in Markdown: current IP, last instance_update run, containers, health. Run the command in the Cursor terminal.',
  {} as any,
  async () => {
    const cmd = [
      "cd ~/MCP-SERVER",
      "echo '## Instance report'",
      "echo ''",
      "echo '### Current IP'",
      "(curl -s --max-time 3 ifconfig.me 2>/dev/null || echo 'unknown')",
      "echo ''",
      "echo '### Last update (instance_update)'",
      "(cat .last-instance-update 2>/dev/null || echo 'never')",
      "echo ''",
      "echo '### Last update status'",
      "(cat .last-update-status 2>/dev/null || echo 'no state')",
      "echo ''",
      "echo '### Containers'",
      "docker compose ps",
      "echo ''",
      "echo '### Health'",
      "curl -s -o /dev/null -w 'API health: %{http_code}' http://localhost/api/health",
      "echo ''",
    ].join(' && ');
    const text = instanceSshCommand(cmd, 'instance_report');
    return { content: [{ type: 'text' as const, text }] };
  },
);

mcpServer.tool(
  'instance_reboot',
  'Return the ready-to-run SSH command to restart all instance services (docker compose restart). Run the command in the Cursor terminal.',
  {} as any,
  async () => {
    const cmd = "cd ~/MCP-SERVER && docker compose restart";
    const text = instanceSshCommand(cmd, 'instance_reboot');
    return { content: [{ type: 'text' as const, text }] };
  },
);

// ----- ClickUp (project manager): local e instancia -----
function clickUpError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

mcpServer.tool(
  'clickup_list_workspaces',
  'List the ClickUp workspaces (teams) you have access to. Use this to find the MCP-SERVER workspace or its team_id. Requires CLICKUP_API_TOKEN in .env.',
  {} as any,
  async () => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN is not set. Add your Personal API Token (pk_...) in .env or gateway/.env (local and instance).' }] };
    }
    try {
      const teams = await getTeams();
      const lines = teams.length === 0
        ? ['No workspaces found.']
        : teams.map((t) => `- id: ${t.id}  name: ${t.name ?? '(no name)'}`);
      return { content: [{ type: 'text' as const, text: `Workspaces (${teams.length}):\n${lines.join('\n')}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `ClickUp error: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_list_spaces',
  'List spaces in a ClickUp workspace. Requires team_id (from clickup_list_workspaces).',
  { team_id: z.string() } as any,
  async (args: { team_id: string }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN is not set.' }] };
    }
    try {
      const spaces = await getSpaces(String(args.team_id).trim());
      const lines = spaces.length === 0
        ? ['No spaces found.']
        : spaces.map((s) => `- id: ${s.id}  name: ${s.name ?? '(no name)'}`);
      return { content: [{ type: 'text' as const, text: `Spaces (${spaces.length}):\n${lines.join('\n')}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `ClickUp error: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_list_folders',
  'List folders (and lists) in a ClickUp space. Requires space_id.',
  { space_id: z.string() } as any,
  async (args: { space_id: string }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN is not set.' }] };
    }
    try {
      const folders = await getFolders(String(args.space_id).trim());
      const lines = folders.length === 0
        ? ['No folders found.']
        : folders.map((f) => `- id: ${f.id}  name: ${f.name ?? '(no name)'}`);
      return { content: [{ type: 'text' as const, text: `Folders (${folders.length}):\n${lines.join('\n')}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `ClickUp error: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_list_lists',
  'List lists in a ClickUp folder (where tasks are created). Requires folder_id.',
  { folder_id: z.string() } as any,
  async (args: { folder_id: string }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN is not set.' }] };
    }
    try {
      const lists = await getLists(String(args.folder_id).trim());
      const lines = lists.length === 0
        ? ['No lists found.']
        : lists.map((l) => `- id: ${l.id}  name: ${l.name ?? '(no name)'}`);
      return { content: [{ type: 'text' as const, text: `Lists (${lists.length}):\n${lines.join('\n')}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `ClickUp error: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_list_tasks',
  'List tasks from a ClickUp list. Use this to view project tickets/tasks. Params: list_id (required), optional status and archived.',
  {
    list_id: z.string(),
    status: z.string().optional(),
    archived: z.boolean().optional(),
  } as any,
  async (args: { list_id: string; status?: string; archived?: boolean }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN is not set.' }] };
    }
    try {
      const tasks = await getTasks(String(args.list_id).trim(), {
        statuses: args.status?.trim(),
        archived: args.archived,
      });
      const lines = tasks.length === 0
        ? ['No tasks found.']
        : tasks.map((t) => {
            const statusStr = t.status?.status ?? '';
            return `- id: ${t.id}  name: ${(t.name ?? '').slice(0, 60)}${(t.name?.length ?? 0) > 60 ? '…' : ''}  status: ${statusStr}`;
          });
      return { content: [{ type: 'text' as const, text: `Tasks (${tasks.length}):\n${lines.join('\n')}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `ClickUp error: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_create_task',
  'Create a task/ticket in a ClickUp list. Use this when the user asks to create a ticket or task. Requires list_id and name; optional: description, status, priority.',
  {
    list_id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.number().optional(),
  } as any,
  async (args: { list_id: string; name: string; description?: string; status?: string; priority?: number }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN is not set.' }] };
    }
    try {
      const body: CreateTaskBody = { name: String(args.name).trim() };
      if (args.description != null) body.description = String(args.description).trim();
      if (args.status != null) body.status = String(args.status).trim();
      if (args.priority != null) body.priority = Number(args.priority);
      const task = await createTask(String(args.list_id).trim(), body);
      return {
        content: [{ type: 'text' as const, text: `Task created: id=${task.id}  name=${task.name ?? '(no name)'}` }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `ClickUp error: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_create_subtask',
  'Create a subtask under a parent task in ClickUp. Requires list_id (same list as the parent task), parent_task_id, and name; optional: description, status, priority.',
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
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN is not set.' }] };
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
        content: [{ type: 'text' as const, text: `Subtask created: id=${task.id}  name=${task.name ?? '(no name)'}` }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `ClickUp error: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_get_task',
  'Get ClickUp task details by task_id.',
  { task_id: z.string() } as any,
  async (args: { task_id: string }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN is not set.' }] };
    }
    try {
      const task = await getTask(String(args.task_id).trim());
      const statusStr = task.status?.status ?? '';
      const text = [
        `id: ${task.id}`,
        `name: ${task.name ?? '(no name)'}`,
        `status: ${statusStr}`,
        task.description ? `description: ${String(task.description).slice(0, 500)}${String(task.description).length > 500 ? '…' : ''}` : '',
      ].filter(Boolean).join('\n');
      return { content: [{ type: 'text' as const, text }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `ClickUp error: ${clickUpError(err)}` }] };
    }
  },
);

mcpServer.tool(
  'clickup_update_task',
  'Update a ClickUp task (status, title, description, priority). Use this to close tickets, change status, or edit. Requires task_id; optional: name, description, status, priority.',
  {
    task_id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.number().optional(),
  } as any,
  async (args: { task_id: string; name?: string; description?: string; status?: string; priority?: number }) => {
    if (!hasClickUpToken()) {
      return { content: [{ type: 'text' as const, text: 'CLICKUP_API_TOKEN is not set.' }] };
    }
    try {
      const body: UpdateTaskBody = {};
      if (args.name != null) body.name = String(args.name).trim();
      if (args.description != null) body.description = String(args.description).trim();
      if (args.status != null) body.status = String(args.status).trim();
      if (args.priority != null) body.priority = Number(args.priority);
      const task = await updateTask(String(args.task_id).trim(), body);
      return {
        content: [{ type: 'text' as const, text: `Task updated: id=${task.id}  name=${task.name ?? '(no name)'}` }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `ClickUp error: ${clickUpError(err)}` }] };
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
    'Alias for Azure DevOps. First argument: accion (e.g. "listar tareas"). Optional second argument: usuario (e.g. "gustavo grisales" or "ggrisales") to see tasks assigned to that person. Without usuario: tasks assigned to you. Invoke: azure with accion="listar tareas" and optionally usuario="Gustavo Grisales".',
    {
      accion: z.string(),
      usuario: z.string().optional(),
    } as any,
    async (args: { accion: string; usuario?: string }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
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
          const who = usuario ? `assigned to "${usuario}"` : 'assigned to you';
          const lines = items.length === 0
            ? [`No work items ${who}.`]
            : items.map((item) => {
                const f = item.fields || {};
                const changed = f['System.ChangedDate'] ? `  ${String(f['System.ChangedDate']).slice(0, 10)}` : '';
                return `#${item.id} [${f['System.WorkItemType'] ?? '?'}] (${f['System.State'] ?? '?'}) ${f['System.Title'] ?? '(untitled)'}${changed}`;
              });
          return { content: [{ type: 'text' as const, text: `Work Items ${who} (${items.length}):\n${lines.join('\n')}` }] };
        } catch (err) {
          return { content: [{ type: 'text' as const, text: `Azure DevOps error: ${azureError(err)}` }] };
        }
      }
      return {
        content: [{ type: 'text' as const, text: `Unrecognized action "${args.accion}". Use accion "listar tareas" and optionally usuario "gustavo grisales".` }],
      };
    },
  );

  mcpServer.tool(
    'azure_list_work_items',
    'List Azure DevOps work items (tickets/bugs/tasks). Optional from_date (YYYY-MM-DD): filter from that date; if to_date is omitted, today is used. Without assigned_to: assigned to you (@Me). With assigned_to: assigned to that user. Optional: type (Bug/Task), states (New,Committed,In Progress), top. Requires AZURE_DEVOPS_* in .env.',
    {
      type: z.string().optional(),
      states: z.string().optional(),
      year: z.number().optional(),
      top: z.number().optional(),
      assigned_to: z.string().optional(),
      from_date: z.string().optional(),
      to_date: z.string().optional(),
      date_field: z.enum(['created', 'changed']).optional(),
    } as any,
    async (args: {
      type?: string;
      states?: string;
      year?: number;
      top?: number;
      assigned_to?: string;
      from_date?: string;
      to_date?: string;
      date_field?: 'created' | 'changed';
    }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_BASE_URL, AZURE_DEVOPS_PROJECT, and AZURE_DEVOPS_PAT must be set in .env.' }] };
      }
      const t0 = Date.now();
      try {
        const type = args.type?.trim();
        const states = args.states ? args.states.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
        const top = args.top ?? 50;
        const assignedTo = args.assigned_to?.trim();
        const fromDate = args.from_date?.trim();
        const toDateRaw = args.to_date?.trim();

        function todayYYYYMMDD(): string {
          const d = new Date();
          return d.toISOString().slice(0, 10);
        }

        let items: Awaited<ReturnType<typeof listWorkItems>>;
        if (fromDate) {
          const toDate = toDateRaw || todayYYYYMMDD();
          const parsedFrom = /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : null;
          const parsedTo = /^\d{4}-\d{2}-\d{2}$/.test(toDate) ? toDate : null;
          if (!parsedFrom || !parsedTo) {
            return {
              content: [{ type: 'text' as const, text: `Invalid date format. Use YYYY-MM-DD for from_date and to_date. Got from_date=${fromDate} to_date=${toDate}.` }],
            };
          }
          items = await listWorkItemsByDateRange({
            fromDate: parsedFrom,
            toDate: parsedTo,
            top,
            assignedTo: assignedTo || undefined,
            assignedToMe: !assignedTo,
            dateField: args.date_field ?? 'changed',
            type: type || undefined,
            states: states.length > 0 ? states : undefined,
          });
        } else {
          items = await listWorkItems({
            type: type || undefined,
            states,
            year: args.year,
            top,
            assignedTo: assignedTo || undefined,
            assignedToMe: !assignedTo,
          });
        }

        const who = assignedTo ? `assigned to "${assignedTo}"` : 'assigned to you';
        const lines = items.length === 0
          ? [`No work items ${who} match those filters.`]
          : items.map((item) => {
              const f = item.fields || {};
              const changed = f['System.ChangedDate'] ? `  ${String(f['System.ChangedDate']).slice(0, 10)}` : '';
              return `#${item.id} [${f['System.WorkItemType'] ?? '?'}] (${f['System.State'] ?? '?'}) ${f['System.Title'] ?? '(untitled)'}${changed}`;
            });
        const summaryText = `Work Items ${who} (${items.length}):\n${lines.join('\n')}`;
        const listItems = items.map((wi) => workItemToListItem(wi));
        const envelope: AzureSuccessEnvelope<{ items: typeof listItems }> = {
          summary_text: summaryText,
          data: { items: listItems },
          meta: { tool_version: 'v2', elapsed_ms: Date.now() - t0, warnings: [] },
        };
        return { content: [{ type: 'text' as const, text: formatMcpContent(envelope, true) }] };
      } catch (err) {
        const errorEnv = toAzureErrorEnvelope(err);
        return { content: [{ type: 'text' as const, text: formatMcpErrorContent(`Azure DevOps error: ${azureError(err)}`, errorEnv, true) }] };
      }
    },
  );

  mcpServer.tool(
    'azure_list_work_items_by_date',
    'List Azure DevOps work items by date range with pagination (for n8n when you need many items). from_date required (YYYY-MM-DD); to_date optional (default today). Optional: type, states, assigned_to, top (max 2000), date_field (created|changed). Makes multiple requests internally so you get more than the API default limit.',
    {
      from_date: z.string(),
      to_date: z.string().optional(),
      type: z.string().optional(),
      states: z.string().optional(),
      assigned_to: z.string().optional(),
      top: z.number().optional(),
      date_field: z.enum(['created', 'changed']).optional(),
    } as any,
    async (args: {
      from_date: string;
      to_date?: string;
      type?: string;
      states?: string;
      assigned_to?: string;
      top?: number;
      date_field?: 'created' | 'changed';
    }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      const t0 = Date.now();
      try {
        function todayYYYYMMDD(): string {
          return new Date().toISOString().slice(0, 10);
        }
        const fromDate = args.from_date?.trim();
        const toDate = (args.to_date?.trim() || todayYYYYMMDD());
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
          return {
            content: [{ type: 'text' as const, text: 'Use YYYY-MM-DD for from_date and to_date.' }],
          };
        }
        const type = args.type?.trim();
        const states = args.states ? args.states.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
        const top = Math.min(Math.max(1, args.top ?? 100), 2000);
        const assignedTo = args.assigned_to?.trim();
        const items = await listWorkItemsByDateRangePaginated({
          fromDate,
          toDate,
          top,
          assignedTo: assignedTo || undefined,
          assignedToMe: !assignedTo,
          dateField: args.date_field ?? 'changed',
          type: type || undefined,
          states: states.length > 0 ? states : undefined,
        });
        const who = assignedTo ? `assigned to "${assignedTo}"` : 'assigned to you';
        const lines = items.length === 0
          ? [`No work items ${who} in ${fromDate}–${toDate}.`]
          : items.map((item) => {
              const f = item.fields || {};
              const changed = f['System.ChangedDate'] ? `  ${String(f['System.ChangedDate']).slice(0, 10)}` : '';
              return `#${item.id} [${f['System.WorkItemType'] ?? '?'}] (${f['System.State'] ?? '?'}) ${f['System.Title'] ?? '(untitled)'}${changed}`;
            });
        const summaryText = `Work Items ${who} (${items.length}) ${fromDate}–${toDate}:\n${lines.join('\n')}`;
        const listItems = items.map((wi) => workItemToListItem(wi));
        const envelope: AzureSuccessEnvelope<{ items: typeof listItems }> = {
          summary_text: summaryText,
          data: { items: listItems },
          meta: { tool_version: 'v2', elapsed_ms: Date.now() - t0, warnings: [] },
        };
        return { content: [{ type: 'text' as const, text: formatMcpContent(envelope, true) }] };
      } catch (err) {
        const errorEnv = toAzureErrorEnvelope(err);
        return { content: [{ type: 'text' as const, text: formatMcpErrorContent(`Azure DevOps error: ${azureError(err)}`, errorEnv, true) }] };
      }
    },
  );

  mcpServer.tool(
    'azure_find_related_work_items',
    'Find Azure DevOps work items by regex match on title within a date range, optionally requiring linked changesets. Useful for topic-based discovery (e.g. shipment, invoice, AWB).',
    {
      from_date: z.string(),
      to_date: z.string().optional(),
      regex: z.string(),
      regex_flags: z.string().optional(),
      must_have_changesets: z.boolean().optional(),
      type: z.string().optional(),
      states: z.string().optional(),
      assigned_to: z.string().optional(),
      date_field: z.enum(['created', 'changed']).optional(),
      top: z.number().optional(),
      scan_top: z.number().optional(),
    } as any,
    async (args: {
      from_date: string;
      to_date?: string;
      regex: string;
      regex_flags?: string;
      must_have_changesets?: boolean;
      type?: string;
      states?: string;
      assigned_to?: string;
      date_field?: 'created' | 'changed';
      top?: number;
      scan_top?: number;
    }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      const t0 = Date.now();
      try {
        function todayYYYYMMDD(): string {
          return new Date().toISOString().slice(0, 10);
        }

        const fromDate = String(args.from_date || '').trim();
        const toDate = String(args.to_date || '').trim() || todayYYYYMMDD();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
          return { content: [{ type: 'text' as const, text: 'Use YYYY-MM-DD for from_date and to_date.' }] };
        }

        const rawPattern = String(args.regex || '').trim();
        if (!rawPattern) {
          return { content: [{ type: 'text' as const, text: 'regex is required.' }] };
        }
        const rawFlags = String(args.regex_flags || 'i').trim();
        // Global/sticky flags are stateful; avoid them in repeated .test() operations.
        const safeFlags = rawFlags.replace(/g/g, '').replace(/y/g, '');
        let titleRegex: RegExp;
        try {
          titleRegex = new RegExp(rawPattern, safeFlags);
        } catch (err) {
          return { content: [{ type: 'text' as const, text: `Invalid regex: ${azureError(err)}` }] };
        }

        const top = Math.min(Math.max(1, args.top ?? 50), 2000);
        const scanTop = Math.min(Math.max(top, args.scan_top ?? Math.max(300, top * 4)), 2000);
        const mustHaveChangesets = args.must_have_changesets !== false;
        const type = args.type?.trim();
        const states = args.states ? args.states.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
        const assignedTo = args.assigned_to?.trim();

        const items = await listWorkItemsByDateRangePaginated({
          fromDate,
          toDate,
          top: scanTop,
          assignedTo: assignedTo || undefined,
          assignedToMe: !assignedTo,
          dateField: args.date_field ?? 'changed',
          type: type || undefined,
          states: states.length > 0 ? states : undefined,
        });

        const filtered: Array<ReturnType<typeof workItemToListItem> & { changeset_ids: number[]; title_match: string }> = [];
        for (const wi of items) {
          const title = String(wi.fields?.['System.Title'] ?? '');
          if (!titleRegex.test(title)) continue;
          const csIds = extractChangesetIds(wi as any);
          if (mustHaveChangesets && csIds.length === 0) continue;
          filtered.push({
            ...workItemToListItem(wi),
            changeset_ids: csIds,
            title_match: title,
          });
          if (filtered.length >= top) break;
        }

        const who = assignedTo ? `assigned to "${assignedTo}"` : 'assigned to you';
        const lines = filtered.length === 0
          ? [`No work items ${who} matched regex /${rawPattern}/${safeFlags} in ${fromDate}–${toDate}.`]
          : filtered.map((item) =>
              `#${item.id} [${item.type ?? '?'}] (${item.state ?? '?'}) ${item.title ?? '(untitled)'}  cs=${item.changeset_ids.length}`
            );

        const summaryText = [
          `Related work items ${who}: ${filtered.length} match(es)`,
          `Window: ${fromDate}–${toDate}  |  Regex: /${rawPattern}/${safeFlags}`,
          `Scanned: ${items.length}  |  require_changesets=${mustHaveChangesets}`,
          '---',
          ...lines,
        ].join('\n');

        const envelope: AzureSuccessEnvelope<{
          matches: Array<ReturnType<typeof workItemToListItem> & { changeset_ids: number[]; title_match: string }>;
          scanned: number;
          regex: string;
          regex_flags: string;
          require_changesets: boolean;
        }> = {
          summary_text: summaryText,
          data: {
            matches: filtered,
            scanned: items.length,
            regex: rawPattern,
            regex_flags: safeFlags,
            require_changesets: mustHaveChangesets,
          },
          meta: { tool_version: 'v2', elapsed_ms: Date.now() - t0, warnings: [] },
        };
        return { content: [{ type: 'text' as const, text: formatMcpContent(envelope, true) }] };
      } catch (err) {
        const errorEnv = toAzureErrorEnvelope(err);
        return { content: [{ type: 'text' as const, text: formatMcpErrorContent(`Azure DevOps error: ${azureError(err)}`, errorEnv, true) }] };
      }
    },
  );

  mcpServer.tool(
    'azure_find_related_work_items_with_code_evidence',
    'Find Azure work items by title regex and rank them with code evidence using grep_code (mgrep) over blueivory/classic sources.',
    {
      from_date: z.string(),
      to_date: z.string().optional(),
      regex: z.string(),
      regex_flags: z.string().optional(),
      must_have_changesets: z.boolean().optional(),
      type: z.string().optional(),
      states: z.string().optional(),
      assigned_to: z.string().optional(),
      date_field: z.enum(['created', 'changed']).optional(),
      top: z.number().optional(),
      scan_top: z.number().optional(),
      code_pattern: z.string().optional(),
      code_path: z.enum(['auto', 'blueivory', 'classic', 'both']).optional(),
      code_include: z.string().optional(),
      code_max_matches: z.number().optional(),
      max_changesets_per_item: z.number().optional(),
    } as any,
    async (args: {
      from_date: string;
      to_date?: string;
      regex: string;
      regex_flags?: string;
      must_have_changesets?: boolean;
      type?: string;
      states?: string;
      assigned_to?: string;
      date_field?: 'created' | 'changed';
      top?: number;
      scan_top?: number;
      code_pattern?: string;
      code_path?: 'auto' | 'blueivory' | 'classic' | 'both';
      code_include?: string;
      code_max_matches?: number;
      max_changesets_per_item?: number;
    }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      const t0 = Date.now();
      try {
        function todayYYYYMMDD(): string {
          return new Date().toISOString().slice(0, 10);
        }

        const fromDate = String(args.from_date || '').trim();
        const toDate = String(args.to_date || '').trim() || todayYYYYMMDD();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
          return { content: [{ type: 'text' as const, text: 'Use YYYY-MM-DD for from_date and to_date.' }] };
        }

        const rawPattern = String(args.regex || '').trim();
        if (!rawPattern) return { content: [{ type: 'text' as const, text: 'regex is required.' }] };
        const rawFlags = String(args.regex_flags || 'i').trim();
        const safeFlags = rawFlags.replace(/g/g, '').replace(/y/g, '');
        let titleRegex: RegExp;
        try {
          titleRegex = new RegExp(rawPattern, safeFlags);
        } catch (err) {
          return { content: [{ type: 'text' as const, text: `Invalid regex: ${azureError(err)}` }] };
        }

        const top = Math.min(Math.max(1, args.top ?? 30), 2000);
        const scanTop = Math.min(Math.max(top, args.scan_top ?? Math.max(300, top * 4)), 2000);
        const mustHaveChangesets = args.must_have_changesets !== false;
        const type = args.type?.trim();
        const states = args.states ? args.states.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
        const assignedTo = args.assigned_to?.trim();
        const codePattern = String(args.code_pattern || rawPattern).trim();
        const codePathMode = args.code_path || 'auto';
        const maxChangesetsPerItem = Math.min(Math.max(1, args.max_changesets_per_item ?? 5), 20);
        const codeMaxMatches = Math.min(Math.max(20, args.code_max_matches ?? 400), 2000);

        const items = await listWorkItemsByDateRangePaginated({
          fromDate,
          toDate,
          top: scanTop,
          assignedTo: assignedTo || undefined,
          assignedToMe: !assignedTo,
          dateField: args.date_field ?? 'changed',
          type: type || undefined,
          states: states.length > 0 ? states : undefined,
        });

        type Candidate = ReturnType<typeof workItemToListItem> & {
          changeset_ids: number[];
          title_match: string;
          changed_paths: string[];
          path_roots: Array<'blueivory' | 'classic'>;
          touched_basenames: string[];
        };

        const candidates: Candidate[] = [];
        for (const wi of items) {
          const title = String(wi.fields?.['System.Title'] ?? '');
          if (!titleRegex.test(title)) continue;
          const csIds = extractChangesetIds(wi as any);
          if (mustHaveChangesets && csIds.length === 0) continue;

          const selectedCs = csIds.slice(0, maxChangesetsPerItem);
          const changedPaths: string[] = [];
          for (const csId of selectedCs) {
            try {
              const ch = await getChangesetChanges(csId);
              for (const it of ch.value || []) {
                const p = String(it.item?.path || it.item?.serverItem || '').trim();
                if (p) changedPaths.push(p);
              }
            } catch {
              // best effort
            }
          }

          const rootsSet = new Set<'blueivory' | 'classic'>();
          for (const p of changedPaths) {
            const up = p.toUpperCase();
            if (up.includes('BLUE-IVORY-')) rootsSet.add('blueivory');
            else rootsSet.add('classic');
          }
          if (rootsSet.size === 0 && codePathMode === 'auto') rootsSet.add('blueivory');

          const basenameSet = new Set<string>();
          for (const p of changedPaths) {
            const normalized = p.replace(/\\/g, '/');
            const b = normalized.split('/').pop() || '';
            if (b) basenameSet.add(b.toLowerCase());
          }

          candidates.push({
            ...workItemToListItem(wi),
            changeset_ids: csIds,
            title_match: title,
            changed_paths: changedPaths,
            path_roots: Array.from(rootsSet),
            touched_basenames: Array.from(basenameSet),
          });
        }

        const rootsToSearch = new Set<'blueivory' | 'classic'>();
        if (codePathMode === 'both') {
          rootsToSearch.add('blueivory');
          rootsToSearch.add('classic');
        } else if (codePathMode === 'blueivory' || codePathMode === 'classic') {
          rootsToSearch.add(codePathMode);
        } else {
          for (const c of candidates) for (const r of c.path_roots) rootsToSearch.add(r);
          if (rootsToSearch.size === 0) rootsToSearch.add('blueivory');
        }

        const grepByRoot = new Map<'blueivory' | 'classic', Awaited<ReturnType<typeof runGrepCode>>>();
        for (const root of rootsToSearch) {
          const grepRes = await runGrepCode({
            pattern: codePattern,
            path: root,
            include: args.code_include,
            ignore_case: safeFlags.includes('i'),
            max_matches: codeMaxMatches,
            context_lines: 0,
          });
          grepByRoot.set(root, grepRes);
        }

        const scored = candidates.map((c) => {
          const evidence: Array<{ file: string; line: number; text: string; root: 'blueivory' | 'classic' }> = [];
          for (const root of c.path_roots) {
            const grepRes = grepByRoot.get(root);
            if (!grepRes || 'error' in grepRes) continue;
            for (const m of grepRes.data.matches) {
              const rel = String(m.file || '');
              const bn = rel.split('/').pop()?.toLowerCase() || '';
              if (bn && c.touched_basenames.includes(bn)) {
                evidence.push({ file: rel, line: m.line, text: m.text, root });
              }
              if (evidence.length >= 20) break;
            }
            if (evidence.length >= 20) break;
          }

          const score = (c.changeset_ids.length > 0 ? 2 : 0) + (evidence.length > 0 ? 3 : 0) + Math.min(3, evidence.length);
          return {
            ...c,
            code_evidence_count: evidence.length,
            code_evidence: evidence.slice(0, 10),
            score,
          };
        });

        const sorted = scored
          .sort((a, b) => b.score - a.score || b.code_evidence_count - a.code_evidence_count || b.id - a.id)
          .slice(0, top);

        const who = assignedTo ? `assigned to "${assignedTo}"` : 'assigned to you';
        const lines = sorted.length === 0
          ? [`No work items ${who} matched regex /${rawPattern}/${safeFlags} in ${fromDate}–${toDate}.`]
          : sorted.map((item) =>
              `#${item.id} [${item.type ?? '?'}] (${item.state ?? '?'}) ${item.title ?? '(untitled)'}  cs=${item.changeset_ids.length}  evidence=${item.code_evidence_count}  score=${item.score}`
            );

        const summaryText = [
          `Related work items with code evidence ${who}: ${sorted.length} match(es)`,
          `Window: ${fromDate}–${toDate}  |  TitleRegex: /${rawPattern}/${safeFlags}  |  CodePattern: ${codePattern}`,
          `Scanned: ${items.length}  |  require_changesets=${mustHaveChangesets}  |  search_roots=${Array.from(rootsToSearch).join(',')}`,
          '---',
          ...lines,
        ].join('\n');

        const envelope: AzureSuccessEnvelope<{
          matches: typeof sorted;
          scanned: number;
          title_regex: string;
          regex_flags: string;
          code_pattern: string;
          code_roots: string[];
          require_changesets: boolean;
        }> = {
          summary_text: summaryText,
          data: {
            matches: sorted,
            scanned: items.length,
            title_regex: rawPattern,
            regex_flags: safeFlags,
            code_pattern: codePattern,
            code_roots: Array.from(rootsToSearch),
            require_changesets: mustHaveChangesets,
          },
          meta: { tool_version: 'v2', elapsed_ms: Date.now() - t0, warnings: [] },
        };
        return { content: [{ type: 'text' as const, text: formatMcpContent(envelope, true) }] };
      } catch (err) {
        const errorEnv = toAzureErrorEnvelope(err);
        return { content: [{ type: 'text' as const, text: formatMcpErrorContent(`Azure DevOps error: ${azureError(err)}`, errorEnv, true) }] };
      }
    },
  );

  mcpServer.tool(
    'azure_get_work_item',
    'Get Azure DevOps work item details by ID. Optional mode: compact (default, structured data + description/expected/actual/repro as plain text), full (compact + raw fields), legacy (plain text only). Requires Azure DevOps config in .env.',
    { work_item_id: z.number(), mode: z.enum(['compact', 'full', 'legacy']).optional() } as any,
    async (args: { work_item_id: number; mode?: 'compact' | 'full' | 'legacy' }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      const t0 = Date.now();
      const mode = args.mode ?? 'compact';
      const useV2 = mode !== 'legacy';
      try {
        const wi = await getWorkItem(args.work_item_id);
        const elapsed = Date.now() - t0;
        const compact = workItemToCompact(wi as { id: number; fields?: Record<string, unknown> });
        const summaryText = workItemSummaryLines(compact).join('\n');
        if (mode === 'legacy') {
          return { content: [{ type: 'text' as const, text: summaryText }] };
        }
        const data = mode === 'full'
          ? { ...compact, raw_fields: wi.fields ?? {} }
          : compact;
        const envelope: AzureSuccessEnvelope<typeof data> = {
          summary_text: summaryText,
          data,
          meta: { tool_version: 'v2', elapsed_ms: elapsed, warnings: [] },
        };
        const text = formatMcpContent(envelope, true);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const elapsed = Date.now() - t0;
        const humanMsg = `Azure DevOps error: ${azureError(err)}`;
        const errorEnv = toAzureErrorEnvelope(err);
        errorEnv.meta.elapsed_ms = elapsed;
        const text = formatMcpErrorContent(humanMsg, errorEnv, useV2);
        return { content: [{ type: 'text' as const, text }] };
      }
    },
  );

  mcpServer.tool(
    'azure_get_work_item_updates',
    'Get the update history (logs) of an Azure DevOps work item. Returns summary_text (changelog) and data.events[] (rev, author, changed_at, field, old, new). Optional: top (default 50), summary_only (default true), only_relevant_fields (default true), include_comments (default true). Requires Azure DevOps config in .env.',
    {
      work_item_id: z.number(),
      top: z.number().optional(),
      summary_only: z.boolean().optional(),
      only_relevant_fields: z.boolean().optional(),
      include_comments: z.boolean().optional(),
    } as any,
    async (args: {
      work_item_id: number;
      top?: number;
      summary_only?: boolean;
      only_relevant_fields?: boolean;
      include_comments?: boolean;
    }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      const t0 = Date.now();
      const summaryOnly = args.summary_only !== false;
      const onlyRelevant = args.only_relevant_fields !== false;
      const includeComments = args.include_comments !== false;
      try {
        const { value: updates } = await getWorkItemUpdates(args.work_item_id, args.top ?? 50);
        const elapsed = Date.now() - t0;
        if (!updates || updates.length === 0) {
          const envelope: AzureSuccessEnvelope<{ work_item_id: number; events: WorkItemUpdateEvent[]; summary_only: boolean }> = {
            summary_text: `Work item #${args.work_item_id}: no update history.`,
            data: { work_item_id: args.work_item_id, events: [], summary_only: summaryOnly },
            meta: { tool_version: 'v2', elapsed_ms: elapsed, warnings: [] },
          };
          return { content: [{ type: 'text' as const, text: formatMcpContent(envelope, true) }] };
        }
        const events = normalizeUpdates(args.work_item_id, updates, {
          only_relevant_fields: onlyRelevant,
          include_comments: includeComments,
        });
        const summaryText = updatesSummaryText(args.work_item_id, events, 15);
        const envelope: AzureSuccessEnvelope<{ work_item_id: number; events: WorkItemUpdateEvent[]; summary_only: boolean }> = {
          summary_text: summaryText,
          data: { work_item_id: args.work_item_id, events, summary_only: summaryOnly },
          meta: { tool_version: 'v2', elapsed_ms: elapsed, warnings: [] },
        };
        const text = formatMcpContent(envelope, true);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const elapsed = Date.now() - t0;
        const humanMsg = `Azure DevOps error: ${azureError(err)}`;
        const errorEnv = toAzureErrorEnvelope(err);
        errorEnv.meta.elapsed_ms = elapsed;
        return { content: [{ type: 'text' as const, text: formatMcpErrorContent(humanMsg, errorEnv, true) }] };
      }
    },
  );

  mcpServer.tool(
    'azure_add_work_item_comment',
    'Use when the user wants to add, post, or write a comment on an Azure DevOps work item (ticket, bug, task). Intent: "comment on ticket", "post to bug", "write in Discussion", "add a note to work item X", "publica/comenta en el ticket/bug [id]". Params: work_item_id (number), comment_text (Markdown; will be formatted in Azure). Config: gateway/.env AZURE_DEVOPS_*.',
    {
      work_item_id: z.number(),
      comment_text: z.string(),
    } as any,
    async (args: { work_item_id: number; comment_text: string }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* not configured in .env.' }] };
      }
      try {
        const text = String(args.comment_text || '').trim();
        if (!text) {
          return { content: [{ type: 'text' as const, text: 'comment_text is required and cannot be empty.' }] };
        }
        await addWorkItemCommentAsMarkdown(args.work_item_id, text);
        return {
          content: [{ type: 'text' as const, text: `Comment added to work item #${args.work_item_id} (Discussion / System.History).` }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_bug_analysis_or_solution',
    'Azure: analysis or solution description for a bug. Invoke with work_item_id (bug number) and mode: "analysis" or "solution". This tool ALWAYS posts the generated content to the work item Discussion (System.History) in Markdown (English). Additionally, it will try to write to the configured Analysis/Solution fields if available (AZURE_DEVOPS_FIELD_ANALYSIS / AZURE_DEVOPS_FIELD_SOLUTION), but field update failures will not block the Discussion comment.',
    {
      work_item_id: z.number(),
      mode: z.enum(['analysis', 'solution']),
      assigned_to: z.string().optional(),
    } as any,
    async (args: { work_item_id: number; mode: 'analysis' | 'solution'; assigned_to?: string }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* not configured in .env.' }] };
      }
      if (!hasOpenAIForBugs()) {
        return { content: [{ type: 'text' as const, text: 'OPENAI_API_KEY not set. Required for analysis/solution generation.' }] };
      }
      const analysisField = (process.env.AZURE_DEVOPS_FIELD_ANALYSIS || 'Custom.PossibleCause').trim();
      const solutionField = (process.env.AZURE_DEVOPS_FIELD_SOLUTION || 'Custom.SolutionDescription').trim();
      try {
        const wi = await getWorkItem(args.work_item_id);
        const f = wi.fields || {};
        const title = String(f['System.Title'] ?? '').trim() || '(no title)';
        const description = String(f['System.Description'] ?? f['Microsoft.VSTS.TCM.ReproSteps'] ?? '').trim() || '(no description)';
        const assignedTo = (f['System.AssignedTo'] as { displayName?: string })?.displayName ?? '';
        if (args.assigned_to?.trim() && assignedTo && !assignedTo.toLowerCase().includes(args.assigned_to.trim().toLowerCase())) {
          return { content: [{ type: 'text' as const, text: `Work item #${args.work_item_id} is assigned to "${assignedTo}", not to "${args.assigned_to}". No update performed.` }] };
        }
        const codeSnippets = findRelevantCode(title, description);
        let text: string;
        let fieldName: string;
        if (args.mode === 'analysis') {
          text = await generatePossibleCauseEnglish(title, description, codeSnippets);
          fieldName = analysisField;
        } else {
          text = await generateSolutionDescriptionEnglish(title, description, codeSnippets);
          fieldName = solutionField;
        }
        const action = args.mode === 'analysis' ? 'Bug analysis' : 'Solution';

        // Always post to Discussion (System.History) so the info is visible even if custom fields are not configured.
        const plainDesc = String(description)
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const descPreview = plainDesc.length > 500 ? `${plainDesc.slice(0, 500)}...` : plainDesc;
        const comment = [
          `## ${action} (auto-generated)`,
          ``,
          `**Work item:** #${args.work_item_id} — ${title}`,
          ``,
          `**Bug context (preview):**`,
          ``,
          descPreview ? `> ${descPreview}` : `> (no description)`,
          ``,
          `### ${action}`,
          ``,
          text,
          ``,
          `_Note: This content was posted to Discussion by the MCP tool. It may also attempt to update configured custom fields._`,
        ].join('\n');
        await addWorkItemCommentAsMarkdown(args.work_item_id, comment);

        // Best-effort: also update the configured field (if present). Do not fail the tool if the field is missing.
        let fieldUpdated = false;
        let fieldUpdateError = '';
        try {
          await updateWorkItemFields(args.work_item_id, { [fieldName]: text });
          fieldUpdated = true;
        } catch (errField) {
          fieldUpdateError = azureError(errField);
        }
        return {
          content: [{
            type: 'text' as const,
            text:
              `Work item #${args.work_item_id}: ${action} posted to Discussion (System.History).\n` +
              (fieldUpdated
                ? `Also updated field "${fieldName}".\n`
                : `Field update skipped/failed for "${fieldName}": ${fieldUpdateError}\n`) +
              `\nPreview:\n${text.slice(0, 600)}${text.length > 600 ? '...' : ''}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_get_bug_changesets',
    'List TFVC changesets linked to a bug/work item. Returns author, date, comment, and modified files per changeset. Requires Azure DevOps config in .env.',
    { bug_id: z.number() } as any,
    async (args: { bug_id: number }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      try {
        const wi = await getWorkItemWithRelations(args.bug_id);
        const title = (wi.fields || {})['System.Title'] ?? '(untitled)';
        const csIds = extractChangesetIds(wi);
        if (csIds.length === 0) {
          return { content: [{ type: 'text' as const, text: `Bug #${args.bug_id} - ${title}\nNo linked changesets found (relations).` }] };
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
    'Get an Azure DevOps TFVC changeset: author, date, comment, and list of modified files. Requires Azure DevOps config in .env.',
    { changeset_id: z.number() } as any,
    async (args: { changeset_id: number }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
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
        return { content: [{ type: 'text' as const, text: `Azure DevOps error: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_get_changeset_diff',
    'Show the diff (changed code) for a file in a changeset. Optional: file_index (index of the file in the changeset list; 0 = first). Requires Azure DevOps config in .env.',
    {
      changeset_id: z.number(),
      file_index: z.number().optional(),
    } as any,
    async (args: { changeset_id: number; file_index?: number }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      try {
        const ch = await getChangesetChanges(args.changeset_id);
        const items = ch.value || [];
        if (items.length === 0) {
          return { content: [{ type: 'text' as const, text: 'This changeset has no modified files.' }] };
        }
        const idx = Math.max(0, Math.min(args.file_index ?? 0, items.length - 1));
        const tfvcPath = items[idx].item?.path || items[idx].item?.serverItem;
        if (!tfvcPath) {
          return { content: [{ type: 'text' as const, text: 'Could not determine the file path.' }] };
        }
        try {
          const { diff, prevCs, currentCs, isNewFile } = await getChangesetFileDiff(tfvcPath, args.changeset_id);
          const header = [
            `File: ${tfvcPath}`,
            isNewFile ? ' (new file in this changeset)' : ` (diff ${prevCs} -> ${currentCs})`,
            '---',
          ].join('\n');
          const diffLines = diff.map((op) => (op.t === '...' ? '...' : op.t + op.s));
          return { content: [{ type: 'text' as const, text: header + '\n' + diffLines.join('\n') }] };
        } catch (errDiff) {
          // Fallback used by the web endpoint as well: compare file snapshots at Cn vs Cn-1.
          const currentCs = args.changeset_id;
          const prevCs = Math.max(1, currentCs - 1);

          let beforeText = '';
          let afterText = '';
          let isNewFile = false;

          afterText = await getTfvcItemTextAtChangeset(tfvcPath, currentCs);
          try {
            beforeText = await getTfvcItemTextAtChangeset(tfvcPath, prevCs);
          } catch {
            beforeText = '';
            isNewFile = true;
          }

          const maxChars = 12000;
          const clip = (s: string) => (s.length > maxChars ? `${s.slice(0, maxChars)}\n... [truncated]` : s);
          const beforePreview = clip(beforeText || '');
          const afterPreview = clip(afterText || '');

          const lines = [
            `File: ${tfvcPath}`,
            `Mode: snapshot fallback (${prevCs} -> ${currentCs})`,
            isNewFile ? 'Note: previous snapshot unavailable (new file or history unavailable).' : '',
            `Reason: ${azureError(errDiff)}`,
            '---',
            `--- ${tfvcPath}@C${prevCs}`,
            `+++ ${tfvcPath}@C${currentCs}`,
            '',
            `[before @C${prevCs}]`,
            beforePreview,
            '',
            `[after @C${currentCs}]`,
            afterPreview,
          ].filter(Boolean);

          return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
        }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error Azure DevOps: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_list_repositories',
    'List Azure DevOps Git repositories available in a project. Optional: project_name (defaults to AZURE_DEVOPS_PROJECT in .env).',
    {
      project_name: z.string().optional(),
    } as any,
    async (args: { project_name?: string }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      try {
        const repos = await listGitRepositories(args.project_name?.trim());
        if (repos.length === 0) {
          const p = args.project_name?.trim();
          const suffix = p ? ` for project "${p}"` : '';
          return { content: [{ type: 'text' as const, text: `No repositories found${suffix}.` }] };
        }

        const lines = repos.map((r) => {
          const id = String(r.id || '').trim();
          const name = String(r.name || '').trim() || '?';
          const proj = String(r.project?.name || '').trim();
          const branch = String(r.defaultBranch || '').trim();
          const web = String(r.webUrl || '').trim();
          const parts = [
            `- ${name}`,
            id ? `id=${id}` : '',
            proj ? `project=${proj}` : '',
            branch ? `default=${branch}` : '',
            web ? `url=${web}` : '',
          ].filter(Boolean);
          return parts.join('  |  ');
        });

        const p = args.project_name?.trim();
        const header = p ? `Repositories in project "${p}" (${repos.length}):` : `Repositories (${repos.length}):`;
        return { content: [{ type: 'text' as const, text: `${header}\n${lines.join('\n')}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Azure DevOps error: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_list_tfvc_paths',
    'List TFVC paths (folders/files) under a TFVC path. Optional: path (defaults to $/AZURE_DEVOPS_PROJECT), recursion_level (None|OneLevel|Full), max_results (default 200).',
    {
      path: z.string().optional(),
      recursion_level: z.string().optional(),
      max_results: z.number().optional(),
    } as any,
    async (args: { path?: string; recursion_level?: string; max_results?: number }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      try {
        const r = String(args.recursion_level || 'OneLevel').trim();
        const recursionLevel = r === 'None' || r === 'OneLevel' || r === 'Full' ? r : 'OneLevel';
        const max = Math.min(Math.max(1, args.max_results ?? 200), 1000);
        const items = await listTfvcItems({
          path: args.path?.trim(),
          recursionLevel: recursionLevel as 'None' | 'OneLevel' | 'Full',
        });
        if (items.length === 0) {
          const where = args.path?.trim() ? ` under "${args.path?.trim()}"` : '';
          return { content: [{ type: 'text' as const, text: `No TFVC items found${where}.` }] };
        }

        const shown = items.slice(0, max);
        const lines = shown.map((it) => {
          const tag = it.isFolder ? '[dir]' : '[file]';
          const size = !it.isFolder && Number.isFinite(it.contentLength) ? `  size=${it.contentLength}` : '';
          return `${tag} ${it.path}${size}`;
        });
        const where = args.path?.trim() ? args.path.trim() : '$/AZURE_DEVOPS_PROJECT';
        const note = items.length > max ? `\n... (${items.length - max} more not shown)` : '';
        return {
          content: [{
            type: 'text' as const,
            text: `TFVC items in ${where} (recursion=${recursionLevel}, total=${items.length}, shown=${shown.length}):\n${lines.join('\n')}${note}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Azure DevOps error: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_list_changesets',
    'List TFVC changesets. Project filter: project "blueivory" or "core" (classic). Optional: author, from_date, to_date (ISO), top (default 100). For indexing into Qdrant you can use top=1400+; the tool paginates internally (Azure API limits 1000 per request).',
    {
      project: z.string().optional(),
      author: z.string().optional(),
      from_date: z.string().optional(),
      to_date: z.string().optional(),
      top: z.number().optional(),
    } as any,
    async (args: { project?: string; author?: string; from_date?: string; to_date?: string; top?: number }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      try {
        const wanted = args.top ?? 100;
        const pageSize = 1000; // Azure DevOps API max per request
        const list: Awaited<ReturnType<typeof listChangesets>> = [];
        let skip = 0;
        while (list.length < wanted) {
          const toFetch = Math.min(pageSize, wanted - list.length);
          const page = await listChangesets({
            project: args.project?.trim(),
            author: args.author?.trim(),
            fromDate: args.from_date?.trim(),
            toDate: args.to_date?.trim(),
            top: toFetch,
            skip,
          });
          list.push(...page);
          if (page.length < toFetch) break;
          skip += page.length;
        }
        const lines = list.length === 0
          ? ['No changesets match those filters.']
          : list.map((cs) => {
              const author = pickAuthor(cs);
              const date = (cs.createdDate || '').slice(0, 10);
              const comment = (cs.comment || '').trim().slice(0, 60);
              return `#${cs.changesetId}  ${author}  ${date}  ${comment}${comment.length >= 60 ? '…' : ''}`;
            });
        const proj = args.project ? ` project=${args.project}` : '';
        const filter = args.author ? ` author="${args.author}"` : '';
        return { content: [{ type: 'text' as const, text: `Changesets${proj}${filter} (${list.length}):\n${lines.join('\n')}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Azure DevOps error: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_get_file_history',
    'Get TFVC history for a specific file path. Returns changesets that touched the path with author/date/comment. Optional filters: from_date, to_date, author, top, project_name.',
    {
      file_path: z.string(),
      from_date: z.string().optional(),
      to_date: z.string().optional(),
      author: z.string().optional(),
      top: z.number().optional(),
      project_name: z.string().optional(),
    } as any,
    async (args: {
      file_path: string;
      from_date?: string;
      to_date?: string;
      author?: string;
      top?: number;
      project_name?: string;
    }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      try {
        const filePath = String(args.file_path || '').trim();
        if (!filePath) {
          return { content: [{ type: 'text' as const, text: 'file_path is required (TFVC path, e.g. $/Project/Branch/file.cpp).' }] };
        }
        const wanted = Math.min(Math.max(1, args.top ?? 100), 2000);
        const pageSize = 1000; // Azure DevOps API max per request
        const list: Awaited<ReturnType<typeof listChangesetsByItemPath>> = [];
        let skip = 0;
        while (list.length < wanted) {
          const toFetch = Math.min(pageSize, wanted - list.length);
          const page = await listChangesetsByItemPath({
            itemPath: filePath,
            projectName: args.project_name?.trim(),
            author: args.author?.trim(),
            fromDate: args.from_date?.trim(),
            toDate: args.to_date?.trim(),
            top: toFetch,
            skip,
          });
          list.push(...page);
          if (page.length < toFetch) break;
          skip += page.length;
        }

        if (list.length === 0) {
          return { content: [{ type: 'text' as const, text: `No changesets found for: ${filePath}` }] };
        }

        const lines = list.map((cs) => {
          const id = cs.changesetId;
          const author = pickAuthor(cs);
          const date = (cs.createdDate || cs.checkinDate || '').slice(0, 19).replace('T', ' ');
          const comment = (cs.comment || '').trim().slice(0, 90);
          return `#${id}  ${author}  ${date}  ${comment}${comment.length >= 90 ? '…' : ''}`;
        });

        const filters: string[] = [];
        if (args.author?.trim()) filters.push(`author="${args.author.trim()}"`);
        if (args.from_date?.trim()) filters.push(`from=${args.from_date.trim()}`);
        if (args.to_date?.trim()) filters.push(`to=${args.to_date.trim()}`);
        if (args.project_name?.trim()) filters.push(`project="${args.project_name.trim()}"`);
        const suffix = filters.length ? ` (${filters.join(', ')})` : '';
        return {
          content: [{
            type: 'text' as const,
            text: `History for ${filePath}${suffix} -> ${list.length} changeset(s):\n${lines.join('\n')}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Azure DevOps error: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_ingest_changesets_bootstrap',
    'Bootstrap ingestion: collect TFVC changesets for one or more paths and store them in remote Postgres (EC2) through SSH + docker compose psql. Use for initial backfill windows.',
    {
      paths: z.string(),
      from_date: z.string(),
      to_date: z.string().optional(),
      top_per_path: z.number().optional(),
      author: z.string().optional(),
      project_name: z.string().optional(),
      include_work_items: z.boolean().optional(),
      dry_run: z.boolean().optional(),
      ssh_target: z.string().optional(),
      ssh_key_path: z.string().optional(),
      remote_repo_path: z.string().optional(),
      db_name: z.string().optional(),
    } as any,
    async (args: {
      paths: string;
      from_date: string;
      to_date?: string;
      top_per_path?: number;
      author?: string;
      project_name?: string;
      include_work_items?: boolean;
      dry_run?: boolean;
      ssh_target?: string;
      ssh_key_path?: string;
      remote_repo_path?: string;
      db_name?: string;
    }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      const paths = String(args.paths || '')
        .split(/[;,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (paths.length === 0) {
        return { content: [{ type: 'text' as const, text: 'paths is required (semicolon/comma/newline separated TFVC paths).' }] };
      }

      const sshTarget = String(args.ssh_target || process.env.INSTANCE_SSH_TARGET || '').trim();
      const sshKeyPath = String(args.ssh_key_path || process.env.INSTANCE_SSH_KEY_PATH || '').trim();
      const remoteRepoPath = String(args.remote_repo_path || process.env.INSTANCE_REPO_PATH || '~/MCP-SERVER').trim();
      const dbName = String(args.db_name || process.env.POSTGRES_DB || 'mcp_hub').trim();
      if (!sshTarget || !sshKeyPath) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Missing SSH target/key. Set INSTANCE_SSH_TARGET and INSTANCE_SSH_KEY_PATH in env or pass ssh_target/ssh_key_path.',
          }],
        };
      }

      try {
        const rows = await collectChangesetsForPaths({
          paths,
          fromDate: args.from_date?.trim(),
          toDate: args.to_date?.trim(),
          author: args.author?.trim(),
          topPerPath: args.top_per_path ?? 1500,
          projectName: args.project_name?.trim(),
        });

        if (args.dry_run === true) {
          const preview = rows.slice(0, 12).map((r) => `#${r.changeset_id} ${r.author} ${r.created_at.slice(0, 19).replace('T', ' ')} ${r.comment.slice(0, 70)}`);
          return {
            content: [{
              type: 'text' as const,
              text: `Dry run. Collected ${rows.length} changeset(s) for ${paths.length} path(s).\n${preview.join('\n')}`,
            }],
          };
        }

        const summary = await ingestRowsToRemotePostgres(rows, {
          sshTarget,
          sshKeyPath,
          remoteRepoPath,
          dbName,
          includeWorkItems: args.include_work_items !== false,
        });
        return {
          content: [{
            type: 'text' as const,
            text:
              `Bootstrap ingestion completed.\n` +
              `Paths: ${paths.length}\n` +
              `Changesets: ${summary.ingested_changesets}\n` +
              `Files: ${summary.ingested_files}\n` +
              `Work-item links: ${summary.ingested_work_item_links}\n` +
              `Distinct work items: ${summary.distinct_work_items}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Azure ingest error: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_ingest_changesets_daily',
    'Daily incremental ingestion: reads recent TFVC changesets for paths and upserts them into remote Postgres. Designed for scheduled runs.',
    {
      paths: z.string(),
      days_back: z.number().optional(),
      top_per_path: z.number().optional(),
      author: z.string().optional(),
      project_name: z.string().optional(),
      include_work_items: z.boolean().optional(),
      dry_run: z.boolean().optional(),
      ssh_target: z.string().optional(),
      ssh_key_path: z.string().optional(),
      remote_repo_path: z.string().optional(),
      db_name: z.string().optional(),
    } as any,
    async (args: {
      paths: string;
      days_back?: number;
      top_per_path?: number;
      author?: string;
      project_name?: string;
      include_work_items?: boolean;
      dry_run?: boolean;
      ssh_target?: string;
      ssh_key_path?: string;
      remote_repo_path?: string;
      db_name?: string;
    }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      const paths = String(args.paths || '')
        .split(/[;,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (paths.length === 0) {
        return { content: [{ type: 'text' as const, text: 'paths is required (semicolon/comma/newline separated TFVC paths).' }] };
      }

      const sshTarget = String(args.ssh_target || process.env.INSTANCE_SSH_TARGET || '').trim();
      const sshKeyPath = String(args.ssh_key_path || process.env.INSTANCE_SSH_KEY_PATH || '').trim();
      const remoteRepoPath = String(args.remote_repo_path || process.env.INSTANCE_REPO_PATH || '~/MCP-SERVER').trim();
      const dbName = String(args.db_name || process.env.POSTGRES_DB || 'mcp_hub').trim();
      if (!sshTarget || !sshKeyPath) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Missing SSH target/key. Set INSTANCE_SSH_TARGET and INSTANCE_SSH_KEY_PATH in env or pass ssh_target/ssh_key_path.',
          }],
        };
      }

      const daysBack = Math.min(Math.max(1, args.days_back ?? 2), 30);
      const now = new Date();
      const toDate = now.toISOString().slice(0, 10);
      const from = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
      const fromDate = from.toISOString().slice(0, 10);
      try {
        const rows = await collectChangesetsForPaths({
          paths,
          fromDate,
          toDate,
          author: args.author?.trim(),
          topPerPath: args.top_per_path ?? 500,
          projectName: args.project_name?.trim(),
        });

        if (args.dry_run === true) {
          const preview = rows.slice(0, 10).map((r) => `#${r.changeset_id} ${r.author} ${r.created_at.slice(0, 19).replace('T', ' ')}`);
          return {
            content: [{
              type: 'text' as const,
              text: `Daily dry run ${fromDate}..${toDate}. Collected ${rows.length} changeset(s).\n${preview.join('\n')}`,
            }],
          };
        }

        const summary = await ingestRowsToRemotePostgres(rows, {
          sshTarget,
          sshKeyPath,
          remoteRepoPath,
          dbName,
          includeWorkItems: args.include_work_items !== false,
        });
        return {
          content: [{
            type: 'text' as const,
            text:
              `Daily ingestion completed (${fromDate}..${toDate}).\n` +
              `Changesets: ${summary.ingested_changesets}\n` +
              `Files: ${summary.ingested_files}\n` +
              `Work-item links: ${summary.ingested_work_item_links}\n` +
              `Distinct work items: ${summary.distinct_work_items}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Azure daily ingest error: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_ingest_changesets_bootstrap_start',
    'Starts bootstrap ingestion as async job and returns job_id. Use azure_ingest_changesets_job_status to poll progress.',
    {
      paths: z.string(),
      from_date: z.string(),
      to_date: z.string().optional(),
      top_per_path: z.number().optional(),
      author: z.string().optional(),
      project_name: z.string().optional(),
      include_work_items: z.boolean().optional(),
      ssh_target: z.string().optional(),
      ssh_key_path: z.string().optional(),
      remote_repo_path: z.string().optional(),
      db_name: z.string().optional(),
    } as any,
    async (args: {
      paths: string;
      from_date: string;
      to_date?: string;
      top_per_path?: number;
      author?: string;
      project_name?: string;
      include_work_items?: boolean;
      ssh_target?: string;
      ssh_key_path?: string;
      remote_repo_path?: string;
      db_name?: string;
    }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      const paths = String(args.paths || '').split(/[;,\n]/).map((s) => s.trim()).filter(Boolean);
      if (paths.length === 0) return { content: [{ type: 'text' as const, text: 'paths is required.' }] };

      const sshTarget = String(args.ssh_target || process.env.INSTANCE_SSH_TARGET || '').trim();
      const sshKeyPath = String(args.ssh_key_path || process.env.INSTANCE_SSH_KEY_PATH || '').trim();
      const remoteRepoPath = String(args.remote_repo_path || process.env.INSTANCE_REPO_PATH || '~/MCP-SERVER').trim();
      const dbName = String(args.db_name || process.env.POSTGRES_DB || 'mcp_hub').trim();
      if (!sshTarget || !sshKeyPath) {
        return { content: [{ type: 'text' as const, text: 'Missing SSH target/key. Set INSTANCE_SSH_TARGET and INSTANCE_SSH_KEY_PATH.' }] };
      }

      const jobId = `ing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const job: IngestJob = {
        job_id: jobId,
        status: 'queued',
        created_at: nowIso(),
        mode: 'bootstrap',
        params: args as unknown as Record<string, unknown>,
        progress: { stage: 'queued', percent: 0, message: 'Queued' },
      };
      ingestJobs.set(jobId, job);

      void (async () => {
        try {
          job.status = 'running';
          job.started_at = nowIso();
          const rows = await collectChangesetsForPaths({
            paths,
            fromDate: args.from_date?.trim(),
            toDate: args.to_date?.trim(),
            author: args.author?.trim(),
            topPerPath: args.top_per_path ?? 1500,
            projectName: args.project_name?.trim(),
            onProgress: (p) => {
              job.progress = {
                stage: p.stage,
                percent: toPercent(p.stage, p.changesets_seen, p.changesets_total_estimate),
                message: p.message,
                changesets_seen: p.changesets_seen,
                changesets_total_estimate: p.changesets_total_estimate,
                files_seen: p.files_seen,
                work_item_links_seen: p.work_item_links_seen,
              };
            },
          });

          const summary = await ingestRowsToRemotePostgres(rows, {
            sshTarget,
            sshKeyPath,
            remoteRepoPath,
            dbName,
            includeWorkItems: args.include_work_items !== false,
            onProgress: (p) => {
              job.progress = {
                stage: p.stage,
                percent: toPercent(p.stage, p.changesets_seen, p.changesets_total_estimate),
                message: p.message,
                changesets_seen: p.changesets_seen,
                changesets_total_estimate: p.changesets_total_estimate,
                files_seen: p.files_seen,
                work_item_links_seen: p.work_item_links_seen,
              };
            },
          });

          job.status = 'completed';
          job.finished_at = nowIso();
          job.progress = { ...job.progress, stage: 'done', percent: 100, message: 'Completed' };
          job.result = {
            ingested_changesets: summary.ingested_changesets,
            ingested_files: summary.ingested_files,
            ingested_work_item_links: summary.ingested_work_item_links,
            distinct_work_items: summary.distinct_work_items,
          };
        } catch (err) {
          job.status = 'failed';
          job.finished_at = nowIso();
          job.error = azureError(err);
          job.progress = { ...job.progress, message: `Failed: ${job.error}` };
        }
      })();

      return {
        content: [{
          type: 'text' as const,
          text: `Started bootstrap ingestion job ${jobId}. Poll with azure_ingest_changesets_job_status.`
        }],
      };
    },
  );

  mcpServer.tool(
    'azure_ingest_changesets_daily_start',
    'Starts daily incremental ingestion as async job and returns job_id. Use azure_ingest_changesets_job_status to poll progress.',
    {
      paths: z.string(),
      days_back: z.number().optional(),
      top_per_path: z.number().optional(),
      author: z.string().optional(),
      project_name: z.string().optional(),
      include_work_items: z.boolean().optional(),
      ssh_target: z.string().optional(),
      ssh_key_path: z.string().optional(),
      remote_repo_path: z.string().optional(),
      db_name: z.string().optional(),
    } as any,
    async (args: {
      paths: string;
      days_back?: number;
      top_per_path?: number;
      author?: string;
      project_name?: string;
      include_work_items?: boolean;
      ssh_target?: string;
      ssh_key_path?: string;
      remote_repo_path?: string;
      db_name?: string;
    }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      const paths = String(args.paths || '').split(/[;,\n]/).map((s) => s.trim()).filter(Boolean);
      if (paths.length === 0) return { content: [{ type: 'text' as const, text: 'paths is required.' }] };

      const sshTarget = String(args.ssh_target || process.env.INSTANCE_SSH_TARGET || '').trim();
      const sshKeyPath = String(args.ssh_key_path || process.env.INSTANCE_SSH_KEY_PATH || '').trim();
      const remoteRepoPath = String(args.remote_repo_path || process.env.INSTANCE_REPO_PATH || '~/MCP-SERVER').trim();
      const dbName = String(args.db_name || process.env.POSTGRES_DB || 'mcp_hub').trim();
      if (!sshTarget || !sshKeyPath) {
        return { content: [{ type: 'text' as const, text: 'Missing SSH target/key. Set INSTANCE_SSH_TARGET and INSTANCE_SSH_KEY_PATH.' }] };
      }

      const daysBack = Math.min(Math.max(1, args.days_back ?? 2), 30);
      const now = new Date();
      const toDate = now.toISOString().slice(0, 10);
      const from = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
      const fromDate = from.toISOString().slice(0, 10);

      const jobId = `ing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const job: IngestJob = {
        job_id: jobId,
        status: 'queued',
        created_at: nowIso(),
        mode: 'daily',
        params: { ...args, from_date: fromDate, to_date: toDate } as unknown as Record<string, unknown>,
        progress: { stage: 'queued', percent: 0, message: 'Queued' },
      };
      ingestJobs.set(jobId, job);

      void (async () => {
        try {
          job.status = 'running';
          job.started_at = nowIso();
          const rows = await collectChangesetsForPaths({
            paths,
            fromDate,
            toDate,
            author: args.author?.trim(),
            topPerPath: args.top_per_path ?? 500,
            projectName: args.project_name?.trim(),
            onProgress: (p) => {
              job.progress = {
                stage: p.stage,
                percent: toPercent(p.stage, p.changesets_seen, p.changesets_total_estimate),
                message: p.message,
                changesets_seen: p.changesets_seen,
                changesets_total_estimate: p.changesets_total_estimate,
                files_seen: p.files_seen,
                work_item_links_seen: p.work_item_links_seen,
              };
            },
          });

          const summary = await ingestRowsToRemotePostgres(rows, {
            sshTarget,
            sshKeyPath,
            remoteRepoPath,
            dbName,
            includeWorkItems: args.include_work_items !== false,
            onProgress: (p) => {
              job.progress = {
                stage: p.stage,
                percent: toPercent(p.stage, p.changesets_seen, p.changesets_total_estimate),
                message: p.message,
                changesets_seen: p.changesets_seen,
                changesets_total_estimate: p.changesets_total_estimate,
                files_seen: p.files_seen,
                work_item_links_seen: p.work_item_links_seen,
              };
            },
          });

          job.status = 'completed';
          job.finished_at = nowIso();
          job.progress = { ...job.progress, stage: 'done', percent: 100, message: 'Completed' };
          job.result = {
            ingested_changesets: summary.ingested_changesets,
            ingested_files: summary.ingested_files,
            ingested_work_item_links: summary.ingested_work_item_links,
            distinct_work_items: summary.distinct_work_items,
          };
        } catch (err) {
          job.status = 'failed';
          job.finished_at = nowIso();
          job.error = azureError(err);
          job.progress = { ...job.progress, message: `Failed: ${job.error}` };
        }
      })();

      return {
        content: [{
          type: 'text' as const,
          text: `Started daily ingestion job ${jobId} for window ${fromDate}..${toDate}. Poll with azure_ingest_changesets_job_status.`,
        }],
      };
    },
  );

  mcpServer.tool(
    'azure_ingest_changesets_job_status',
    'Get status/progress of an ingestion job by job_id.',
    { job_id: z.string() } as any,
    async (args: { job_id: string }) => {
      const id = String(args.job_id || '').trim();
      if (!id) return { content: [{ type: 'text' as const, text: 'job_id is required.' }] };
      const job = ingestJobs.get(id);
      if (!job) return { content: [{ type: 'text' as const, text: `Job not found: ${id}` }] };
      const lines = [
        `job_id: ${job.job_id}`,
        `mode: ${job.mode}`,
        `status: ${job.status}`,
        `created_at: ${job.created_at}`,
        job.started_at ? `started_at: ${job.started_at}` : '',
        job.finished_at ? `finished_at: ${job.finished_at}` : '',
        `progress: ${job.progress.percent}% (${job.progress.stage})`,
        job.progress.message ? `message: ${job.progress.message}` : '',
        Number.isFinite(job.progress.changesets_seen as number)
          ? `changesets: ${job.progress.changesets_seen}${job.progress.changesets_total_estimate ? '/' + job.progress.changesets_total_estimate : ''}`
          : '',
        Number.isFinite(job.progress.files_seen as number) ? `files_seen: ${job.progress.files_seen}` : '',
        Number.isFinite(job.progress.work_item_links_seen as number) ? `work_item_links_seen: ${job.progress.work_item_links_seen}` : '',
        job.error ? `error: ${job.error}` : '',
        job.result ? `result: cs=${job.result.ingested_changesets}, files=${job.result.ingested_files}, links=${job.result.ingested_work_item_links}, wi=${job.result.distinct_work_items}` : '',
      ].filter(Boolean);
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  mcpServer.tool(
    'azure_count_changesets',
    'Count TFVC changesets. Project filter: project "blueivory" or "core" (classic). Optional: author, from_date, to_date (ISO), max_count (default 100000).',
    {
      project: z.string().optional(),
      author: z.string().optional(),
      from_date: z.string().optional(),
      to_date: z.string().optional(),
      max_count: z.number().optional(),
    } as any,
    async (args: { project?: string; author?: string; from_date?: string; to_date?: string; max_count?: number }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      try {
        const { count, truncated } = await getChangesetCount({
          project: args.project?.trim(),
          author: args.author?.trim(),
          fromDate: args.from_date?.trim(),
          toDate: args.to_date?.trim(),
          maxCount: args.max_count,
        });
        const proj = args.project ? ` project ${args.project}` : '';
        const filter = args.author ? ` author ${args.author}` : '';
        const note = truncated ? ' [truncated by max_count]' : '';
        return { content: [{ type: 'text' as const, text: `Changesets${proj}${filter}: ${count}${note}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Azure DevOps error: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'azure_list_changeset_authors',
    'List developers with at least one TFVC changeset. Project filter: project "blueivory" or "core" (classic). Optional: max_scan (default 2000).',
    { project: z.string().optional(), max_scan: z.number().optional() } as any,
    async (args: { project?: string; max_scan?: number }) => {
      if (!hasAzureDevOpsConfig()) {
        return { content: [{ type: 'text' as const, text: 'AZURE_DEVOPS_* is not configured in .env.' }] };
      }
      try {
        const authors = await listChangesetAuthors(args.max_scan ?? 2000, args.project?.trim());
        const proj = args.project ? ` (project ${args.project})` : '';
        const text = authors.length === 0
          ? `No authors found${proj} (check max_scan or project).`
          : `Developers with changesets${proj} (${authors.length}):\n${authors.map((a) => `- ${a}`).join('\n')}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Azure DevOps error: ${azureError(err)}` }] };
      }
    },
  );

  mcpServer.tool(
    'tree_sitter_parse',
    'Parse a source file with Tree-sitter and return the AST as S-expression. Supports an automation-friendly summary mode via summary_only. Supported: .ts, .tsx, .js, .jsx, .mjs, .cjs, .c, .h, .cpp, .cc, .cxx, .c++, .hpp, .hxx. Path is relative to project root or absolute.',
    {
      file_path: z.string(),
      summary_only: z.boolean().optional(),
      max_top_node_types: z.number().optional(),
      max_interesting_nodes: z.number().optional(),
    } as any,
    async (args: { file_path: string; summary_only?: boolean; max_top_node_types?: number; max_interesting_nodes?: number }) => {
      const result = parseFileWithTreeSitter(args.file_path, {
        summaryOnly: args.summary_only,
        maxTopNodeTypes: args.max_top_node_types,
        maxInterestingNodes: args.max_interesting_nodes,
      });
      if (!result.ok) {
        return {
          content: [{ type: 'text' as const, text: `Tree-sitter parse failed: ${result.error}\nPath: ${result.path}` }],
        };
      }
      const summaryLines = [
        `Tree-sitter parse completed`,
        `Path: ${result.path}`,
        `Language: ${result.language}`,
        `Total nodes: ${result.summary?.totalNodes ?? 0}`,
        `Named nodes: ${result.summary?.namedNodes ?? 0}`,
        `Max depth: ${result.summary?.maxDepth ?? 0}`,
      ];
      if ((result.summary?.interestingNodes.length ?? 0) > 0) {
        summaryLines.push(
          `Interesting nodes: ${result.summary?.interestingNodes.slice(0, 8).map((n) => `${n.type}@${n.startLine}-${n.endLine}`).join(', ')}`,
        );
      }
      const text = args.summary_only
        ? `${summaryLines.join('\n')}${TREE_SITTER_V2_DELIMITER}${JSON.stringify({
            path: result.path,
            language: result.language,
            summary: result.summary,
            ast_included: false,
          }, null, 2)}`
        : `${summaryLines.join('\n')}\n\nAST for ${result.path} (${result.language})\n\n${result.ast ?? ''}${TREE_SITTER_V2_DELIMITER}${JSON.stringify({
            path: result.path,
            language: result.language,
            summary: result.summary,
            ast_included: true,
          }, null, 2)}`;
      return {
        content: [{ type: 'text' as const, text }],
      };
    },
  );

  mcpServer.tool(
    'semgrep_scan',
    'Run Semgrep static analysis on a directory. Requires semgrep CLI installed (pip install semgrep). Use for security/quality scans. Path relative to project root or absolute. Optional: config (default "auto"), format (text|json), timeout_ms, include and exclude comma-separated glob filters.',
    {
      path: z.string(),
      config: z.string().optional(),
      format: z.enum(['text', 'json']).optional(),
      timeout_ms: z.number().optional(),
      include: z.string().optional(),
      exclude: z.string().optional(),
    } as any,
    async (args: { path: string; config?: string; format?: 'text' | 'json'; timeout_ms?: number; include?: string; exclude?: string }) => {
      const result = await runSemgrepScan({
        path: args.path,
        config: args.config,
        format: args.format ?? 'text',
        timeoutMs: args.timeout_ms,
        include: args.include,
        exclude: args.exclude,
      });
      const parts: string[] = [
        `Semgrep scan ${result.ok ? 'completed' : 'failed'}`,
        `Target: ${result.target}`,
        `Status: ${result.status}`,
        `Config: ${result.config}`,
        `Format: ${result.format}`,
        `Elapsed ms: ${result.elapsedMs}`,
        `Timed out: ${result.timedOut ? 'yes' : 'no'}`,
      ];
      if (result.exitCode != null) parts.push(`Exit code: ${result.exitCode}`);
      if (result.findingsCount !== undefined) parts.push(`Findings: ${result.findingsCount}`);
      if (result.warnings?.length) parts.push(`Warnings: ${result.warnings.join(' | ')}`);
      if (result.includePatterns?.length) parts.push(`Include: ${result.includePatterns.join(', ')}`);
      if (result.excludePatterns?.length) parts.push(`Exclude: ${result.excludePatterns.join(', ')}`);
      if (result.error) parts.push(`Note: ${result.error}`);
      if (result.stdout) parts.push('\n--- stdout ---\n', result.stdout);
      if (result.stderr) parts.push('\n--- stderr ---\n', result.stderr);
      const envelope = {
        target: result.target,
        status: result.status,
        ok: result.ok,
        config: result.config,
        format: result.format,
        elapsed_ms: result.elapsedMs,
        timed_out: result.timedOut,
        exit_code: result.exitCode ?? null,
        findings_count: result.findingsCount ?? null,
        warnings: result.warnings ?? [],
        include_patterns: result.includePatterns ?? [],
        exclude_patterns: result.excludePatterns ?? [],
        error: result.error ?? null,
        parsed_json: result.parsedJson ?? null,
      };
      const text = `${parts.join('\n')}${SEMGREP_V2_DELIMITER}${JSON.stringify(envelope, null, 2)}`;
      return {
        content: [{ type: 'text' as const, text }],
      };
    },
  );

  mcpServer.tool(
    'read_file_region',
    'Read an exact file region from blueivory or classic. Supports start_line/end_line or line + context_before/context_after. Returns envelope with summary_text, data.file_path, data.start_line, data.end_line, data.content, and meta.',
    {
      file_path: z.string(),
      start_line: z.number().optional(),
      end_line: z.number().optional(),
      line: z.number().optional(),
      context_before: z.number().optional(),
      context_after: z.number().optional(),
    } as any,
    async (args: {
      file_path: string;
      start_line?: number;
      end_line?: number;
      line?: number;
      context_before?: number;
      context_after?: number;
    }) => {
      const result = runReadFileRegion({
        file_path: args.file_path,
        start_line: args.start_line,
        end_line: args.end_line,
        line: args.line,
        context_before: args.context_before,
        context_after: args.context_after,
      });
      const text = JSON.stringify(result, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  mcpServer.tool(
    'grep_code',
    'Search with ripgrep (rg) in blueivory or classic. Exact/regex matches. Returns envelope: summary_text, data.matches (file, line, column, text, context_before/after), meta. Complements search_docs (Qdrant).',
    {
      pattern: z.string(),
      path: z.string().optional(),
      include: z.string().optional(),
      ignore_case: z.boolean().optional(),
      max_matches: z.number().optional(),
      context_lines: z.number().optional(),
    } as any,
    async (args: {
      pattern: string;
      path?: string;
      include?: string;
      ignore_case?: boolean;
      max_matches?: number;
      context_lines?: number;
    }) => {
      const result = await runGrepCode({
        pattern: args.pattern,
        path: args.path,
        include: args.include,
        ignore_case: args.ignore_case,
        max_matches: args.max_matches,
        context_lines: args.context_lines,
      });
      const text = JSON.stringify(result, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  mcpServer.tool(
    'grep_symbols',
    'Extract C/C++ symbols (function, class, struct, namespace) in blueivory or classic via ripgrep. Returns envelope: summary_text, data.counts, data.symbols (kind, name, file, line, signature). Useful for flow and entrypoints.',
    {
      query: z.string().optional(),
      path: z.string().optional(),
      symbol_types: z.array(z.enum(['function', 'class', 'struct', 'namespace'])).optional(),
      max_results: z.number().optional(),
      include: z.string().optional(),
    } as any,
    async (args: {
      query?: string;
      path?: string;
      symbol_types?: Array<'function' | 'class' | 'struct' | 'namespace'>;
      max_results?: number;
      include?: string;
    }) => {
      const result = await runGrepSymbols({
        query: args.query,
        path: args.path,
        symbol_types: args.symbol_types,
        max_results: args.max_results,
        include: args.include,
      });
      const text = JSON.stringify(result, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  mcpServer.tool(
    'list_tools',
    'List all available MCP tools with their name and description. Use this when the user asks what tools exist, what the MCP can do, or what each tool does.',
    {} as any,
    async () => {
      const tools = getMcpToolsCatalog();
      const lines = tools.map((t, i) => `${i + 1}. **${t.name}**\n   ${t.description}`);
      const text = `## Available MCP tools (${tools.length})\n\n${lines.join('\n\n')}`;
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
  // Log to stderr so we don't interfere with the MCP protocol on stdout
  console.error('MCP Knowledge Hub server running on stdio');
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
