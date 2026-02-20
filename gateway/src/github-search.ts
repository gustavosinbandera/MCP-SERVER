/**
 * Búsqueda de repositorios en GitHub por tema.
 * Usa la GitHub Search API. Con GITHUB_TOKEN (opcional) se aumenta el límite de peticiones.
 * Para "actualidad tech" se ordena por updated; opcionalmente por stars (mejor puntuación).
 */

const GITHUB_API = 'https://api.github.com/search/repositories';
const USER_AGENT = 'MCP-Knowledge-Hub/1.0';

export type GitHubReposSort = 'updated' | 'stars' | 'forks';

export interface GitHubRepoItem {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  language: string | null;
  topics: string[];
  default_branch: string;
}

export interface SearchGitHubReposResult {
  ok: boolean;
  total_count: number;
  repos: GitHubRepoItem[];
  error?: string;
}

/** Topics de GitHub que podemos forzar (topic:xxx) para filtrar por ecosistema. */
const KNOWN_TOPICS = new Set([
  'esp32', 'esp8266', 'arduino', 'raspberry-pi', 'mcp', 'embedded', 'iot', 'micropython',
  'react', 'vue', 'nextjs', 'node', 'docker', 'kubernetes', 'machine-learning', 'llm',
  'freertos', 'rtos', 'database', 'api', 'rest', 'graphql', 'aws', 'azure', 'gcp',
  'postgresql', 'redis', 'mongodb', 'sqlite', 'terraform', 'ansible', 'github-actions',
  'open-source', 'opensource', 'tutorial', 'starter', 'boilerplate', 'framework',
  'cli', 'sdk', 'library', 'plugin', 'extension', 'vscode', 'android', 'ios',
  'webapp', 'backend', 'frontend', 'fullstack', 'serverless', 'microservices',
]);

/** Palabras que mapean a language: de la API de GitHub (nombre exacto del lenguaje). */
const LANGUAGE_MAP: Record<string, string> = {
  'c++': 'C++', 'cpp': 'C++', 'c plus plus': 'C++',
  'c': 'C',
  'python': 'Python', 'py': 'Python',
  'javascript': 'JavaScript', 'js': 'JavaScript',
  'typescript': 'TypeScript', 'ts': 'TypeScript',
  'go': 'Go', 'golang': 'Go',
  'rust': 'Rust',
  'java': 'Java',
  'c#': 'C#', 'csharp': 'C#',
  'kotlin': 'Kotlin',
  'swift': 'Swift',
  'ruby': 'Ruby',
  'php': 'PHP',
  'scala': 'Scala',
  'r': 'R',
  'dart': 'Dart',
  'elixir': 'Elixir',
  'haskell': 'Haskell',
  'lua': 'Lua',
  'shell': 'Shell',
  'powershell': 'PowerShell',
};

/** Palabras que indican orden: actualidad (updated) o mejor valorados (stars). */
const SORT_HINT_WORDS: Record<string, GitHubReposSort> = {
  recent: 'updated', actualidad: 'updated', ultimo: 'updated', último: 'updated',
  updated: 'updated', nuevo: 'updated', nuevos: 'updated', active: 'updated',
  stars: 'stars', mejor: 'stars', mejores: 'stars', top: 'stars', popular: 'stars',
  forks: 'forks',
};

/** Resultado de buildQuery: query y opcionalmente sort/filtros inferidos. */
interface BuiltQuery {
  q: string;
  sort?: GitHubReposSort;
}

/**
 * Construye una query de GitHub con topic:, language:, y filtros según el texto.
 * Infiere sort (recent/actualidad → updated; stars/mejor/top → stars).
 * Acepta min-stars N, stars>N, pushed 2024, activo (archived:false).
 */
function buildQuery(topic: string): BuiltQuery {
  const raw = topic.trim();
  if (!raw) return { q: 'topic:github' };

  let working = raw
    .toLowerCase()
    .replace(/c\+\+/g, ' c++ ')
    .replace(/\s+/g, ' ')
    .trim();

  // Filtros explícitos: min-stars 500, stars>100, stars:>500
  let starsMin = 0;
  working = working.replace(/\b(?:min[- ]?stars?|stars?[- ]?>\s*|stars?:\s*>\s*)(\d+)\b/gi, (_, n) => {
    starsMin = Math.max(starsMin, parseInt(n, 10));
    return ' ';
  });
  const starsMatch = working.match(/\bstars?[>\s]*(\d+)\b/);
  if (starsMatch && starsMin === 0) {
    starsMin = parseInt(starsMatch[1], 10);
    working = working.replace(/\bstars?[>\s]*\d+\b/, ' ');
  }

  // Año / pushed: 2024, last year, pushed 2023
  let pushedAfter = '';
  const yearMatch = working.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    pushedAfter = `${yearMatch[1]}-01-01`;
    working = working.replace(/\b20\d{2}\b/, ' ');
  }
  if (/\b(?:last\s+year|último\s+año|este\s+año)\b/i.test(working)) {
    const y = new Date().getFullYear() - 1;
    pushedAfter = `${y}-01-01`;
    working = working.replace(/\b(?:last\s+year|último\s+año|este\s+año)\b/gi, ' ');
  }

  // Activo / no archivados
  let excludeArchived = false;
  if (/\b(?:active|activo|no\s+archived|activos)\b/i.test(working)) {
    excludeArchived = true;
    working = working.replace(/\b(?:active|activo|no\s+archived|activos)\b/gi, ' ');
  }

  const words = working.replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean);

  const topicSet = new Set<string>();
  let languageQualifier: string | null = null;
  let sortHint: GitHubReposSort | undefined;
  const rest: string[] = [];

  for (const w of words) {
    const wNorm = w.replace(/[^\w\-+]/g, '') || w;
    if (SORT_HINT_WORDS[w] || SORT_HINT_WORDS[wNorm]) {
      if (!sortHint) sortHint = SORT_HINT_WORDS[w] || SORT_HINT_WORDS[wNorm];
      continue;
    }
    if (KNOWN_TOPICS.has(w) || KNOWN_TOPICS.has(wNorm)) {
      topicSet.add(wNorm || w);
    } else if (LANGUAGE_MAP[w] || LANGUAGE_MAP[wNorm]) {
      if (!languageQualifier) languageQualifier = LANGUAGE_MAP[w] || LANGUAGE_MAP[wNorm];
    } else {
      rest.push(w);
    }
  }

  const parts: string[] = [];
  topicSet.forEach((t) => parts.push(`topic:${t}`));
  if (languageQualifier) parts.push(`language:${languageQualifier}`);
  if (starsMin > 0) parts.push(`stars:>${starsMin}`);
  if (pushedAfter) parts.push(`pushed:>${pushedAfter}`);
  if (excludeArchived) parts.push('archived:false');
  if (rest.length > 0) {
    const restClean = rest.join(' ').replace(/[^\w\s\-\.]/g, ' ').replace(/\s+/g, ' ').trim();
    if (restClean) parts.push(`${restClean} in:name,description,readme`);
  }

  let q: string;
  if (parts.length === 0) {
    q = `${raw.replace(/[^\w\s\-\.]/g, ' ').trim()} in:name,description,readme`;
  } else {
    q = parts.join(' ');
  }

  return { q, sort: sortHint };
}

/**
 * Busca repositorios en GitHub por tema. Orden por defecto: actualidad (updated).
 * Opción sort=stars para mejor puntuación. buildQuery puede inferir sort y filtros del texto.
 */
export async function searchGitHubRepos(
  topic: string,
  options: { limit?: number; sort?: GitHubReposSort } = {}
): Promise<SearchGitHubReposResult> {
  const limit = Math.min(Math.max(1, options.limit ?? 10), 30);
  const built = buildQuery(topic);
  const sort = options.sort ?? built.sort ?? 'updated';

  const params = new URLSearchParams({
    q: built.q,
    sort,
    order: 'desc',
    per_page: String(limit),
  });

  const url = `${GITHUB_API}?${params.toString()}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': USER_AGENT,
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { headers });
    const data = (await res.json()) as {
      total_count?: number;
      items?: Array<{
        full_name: string;
        html_url: string;
        description: string | null;
        stargazers_count: number;
        forks_count: number;
        updated_at: string;
        language: string | null;
        topics?: string[];
        default_branch: string;
      }>;
      message?: string;
      documentation_url?: string;
    };

    if (!res.ok) {
      const msg = data.message ?? `HTTP ${res.status}`;
      return {
        ok: false,
        total_count: 0,
        repos: [],
        error: msg,
      };
    }

    const items = data.items ?? [];
    const repos: GitHubRepoItem[] = items.map((item) => ({
      full_name: item.full_name,
      html_url: item.html_url,
      description: item.description ?? null,
      stargazers_count: item.stargazers_count ?? 0,
      forks_count: item.forks_count ?? 0,
      updated_at: item.updated_at ?? '',
      language: item.language ?? null,
      topics: Array.isArray(item.topics) ? item.topics : [],
      default_branch: item.default_branch ?? 'main',
    }));

    return {
      ok: true,
      total_count: data.total_count ?? 0,
      repos,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      total_count: 0,
      repos: [],
      error: message,
    };
  }
}
