/**
 * Search GitHub repositories by topic.
 * Uses the GitHub Search API. With GITHUB_TOKEN (optional) you get higher rate limits.
 * For "what's current" sort by updated; optionally by stars (highest score).
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

/** GitHub topics we can force (topic:xxx) to filter by ecosystem. */
const KNOWN_TOPICS = new Set([
  'esp32', 'esp8266', 'arduino', 'raspberry-pi', 'mcp', 'embedded', 'iot', 'micropython',
  'react', 'vue', 'nextjs', 'node', 'docker', 'kubernetes', 'machine-learning', 'llm',
  'freertos', 'rtos', 'database', 'api', 'rest', 'graphql', 'aws', 'azure', 'gcp',
  'postgresql', 'redis', 'mongodb', 'sqlite', 'terraform', 'ansible', 'github-actions',
  'open-source', 'opensource', 'tutorial', 'starter', 'boilerplate', 'framework',
  'cli', 'sdk', 'library', 'plugin', 'extension', 'vscode', 'android', 'ios',
  'webapp', 'backend', 'frontend', 'fullstack', 'serverless', 'microservices',
]);

/** Words that map to GitHub API language: (exact language name). */
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

/** Words that hint sort: recent (updated) or top-rated (stars). */
const SORT_HINT_WORDS: Record<string, GitHubReposSort> = {
  recent: 'updated',
  latest: 'updated',
  updated: 'updated',
  new: 'updated',
  active: 'updated',
  stars: 'stars',
  best: 'stars',
  top: 'stars',
  popular: 'stars',
  forks: 'forks',
};

/** buildQuery output: query and optionally inferred sort/filters. */
interface BuiltQuery {
  q: string;
  sort?: GitHubReposSort;
}

/**
 * Build a GitHub query with topic:, language:, and filters inferred from text.
 * Infers sort (recent/latest → updated; stars/best/top → stars).
 * Supports min-stars N, stars>N, pushed 2024, active (archived:false).
 */
function buildQuery(topic: string): BuiltQuery {
  const raw = topic.trim();
  if (!raw) return { q: 'topic:github' };

  let working = raw
    .toLowerCase()
    .replace(/c\+\+/g, ' c++ ')
    .replace(/\s+/g, ' ')
    .trim();

  // Explicit filters: min-stars 500, stars>100, stars:>500
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

  // Year / pushed: 2024, last year, this year, pushed 2023
  let pushedAfter = '';
  const yearMatch = working.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    pushedAfter = `${yearMatch[1]}-01-01`;
    working = working.replace(/\b20\d{2}\b/, ' ');
  }
  const relYear = working.match(/\b(?:last\s+year|this\s+year)\b/i)?.[0]?.toLowerCase();
  if (relYear) {
    const nowYear = new Date().getFullYear();
    const y = relYear.includes('last') ? nowYear - 1 : nowYear;
    pushedAfter = `${y}-01-01`;
    working = working.replace(/\b(?:last\s+year|this\s+year)\b/gi, ' ');
  }

  // Active / not archived
  let excludeArchived = false;
  if (/\b(?:active|no\s+archived)\b/i.test(working)) {
    excludeArchived = true;
    working = working.replace(/\b(?:active|no\s+archived)\b/gi, ' ');
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
 * Search GitHub repositories by topic. Default sort: updated (recent activity).
 * sort=stars returns top-rated results. buildQuery can infer sort and filters from text.
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
