/**
 * Tree-sitter integration for MCP: parse source files and return AST (S-expression).
 * Supports TypeScript, TSX, JavaScript, JSX, C, C++ via tree-sitter grammars.
 */

import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Parser = require('tree-sitter') as typeof import('tree-sitter');
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import ParserC from 'tree-sitter-c';
import ParserCpp from 'tree-sitter-cpp';
import { getProjectRoot, getSharedDirsEntries } from './config';

type LangKey = 'typescript' | 'tsx' | 'javascript' | 'c' | 'cpp';
export const TREE_SITTER_V2_DELIMITER = '\n\n<!--TREE_SITTER_V2-->\n';

interface TreeSitterNodeSummary {
  type: string;
  count: number;
}

interface TreeSitterInterestingNode {
  type: string;
  startLine: number;
  endLine: number;
}

export interface TreeSitterSummary {
  totalNodes: number;
  namedNodes: number;
  maxDepth: number;
  topNodeTypes: TreeSitterNodeSummary[];
  interestingNodes: TreeSitterInterestingNode[];
}

const EXT_TO_LANG: Record<string, LangKey> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.c++': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
};

function getLanguageForPath(filePath: string): LangKey | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_LANG[ext];
}

function createParserForLang(lang: LangKey): InstanceType<typeof Parser> {
  const parser = new Parser();
  if (lang === 'javascript') {
    parser.setLanguage(JavaScript);
  } else if (lang === 'typescript' || lang === 'tsx') {
    const ts = TypeScript;
    parser.setLanguage(lang === 'tsx' ? ts.tsx : ts.typescript);
  } else if (lang === 'c') {
    parser.setLanguage(ParserC);
  } else {
    parser.setLanguage(ParserCpp);
  }
  return parser;
}

const pathSep = path.sep;
const pathSepAlt = pathSep === '/' ? '\\' : '/';

/**
 * Resolve path: if absolute, use as-is. Otherwise try (1) project root, then (2) SHARED_DIRS
 * when the path starts with a project name (e.g. blueivory/..., classic/...).
 */
function resolvePath(inputPath: string): { resolved: string; relativeDisplay: string } {
  const trimmed = inputPath.trim().replace(/[/\\]+/g, pathSep);
  if (path.isAbsolute(trimmed)) {
    return { resolved: trimmed, relativeDisplay: trimmed };
  }
  const projectRoot = getProjectRoot();
  const fromProjectRoot = path.join(projectRoot, trimmed);
  if (fs.existsSync(fromProjectRoot)) {
    return { resolved: fromProjectRoot, relativeDisplay: path.relative(projectRoot, fromProjectRoot) || trimmed };
  }
  const entries = getSharedDirsEntries();
  for (const entry of entries) {
    const prefix = entry.project + pathSep;
    const prefixAlt = entry.project + pathSepAlt;
    if (trimmed.startsWith(prefix) || trimmed.startsWith(prefixAlt)) {
      const rest = trimmed.slice(entry.project.length + 1).replace(/[/\\]+/g, pathSep);
      const underShared = path.join(entry.path, rest);
      if (fs.existsSync(underShared)) {
        const display = path.relative(entry.path, underShared);
        return { resolved: underShared, relativeDisplay: `${entry.project}/${display.replace(/\\/g, '/')}` };
      }
    }
  }
  return { resolved: fromProjectRoot, relativeDisplay: path.relative(projectRoot, fromProjectRoot) || trimmed };
}

export interface TreeSitterParseResult {
  ok: boolean;
  path: string;
  language?: LangKey;
  ast?: string;
  summary?: TreeSitterSummary;
  error?: string;
}

type TreeNodeLike = {
  type: string;
  isNamed?: boolean;
  childCount: number;
  child: (index: number) => TreeNodeLike | null;
  startPosition?: { row: number; column: number };
  endPosition?: { row: number; column: number };
};

const INTERESTING_NODE_TYPES = [
  'function',
  'method',
  'class',
  'struct',
  'namespace',
  'interface',
  'enum',
];

function summarizeTree(rootNode: TreeNodeLike, maxTopNodeTypes = 12, maxInterestingNodes = 20): TreeSitterSummary {
  const counts = new Map<string, number>();
  const interestingNodes: TreeSitterInterestingNode[] = [];
  let totalNodes = 0;
  let namedNodes = 0;
  let maxDepth = 0;

  const visit = (node: TreeNodeLike, depth: number) => {
    totalNodes += 1;
    if (node.isNamed) namedNodes += 1;
    if (depth > maxDepth) maxDepth = depth;
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);

    const lowerType = node.type.toLowerCase();
    if (
      interestingNodes.length < maxInterestingNodes &&
      INTERESTING_NODE_TYPES.some((part) => lowerType.includes(part))
    ) {
      interestingNodes.push({
        type: node.type,
        startLine: (node.startPosition?.row ?? 0) + 1,
        endLine: (node.endPosition?.row ?? 0) + 1,
      });
    }

    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      if (child) visit(child, depth + 1);
    }
  };

  visit(rootNode, 0);

  const topNodeTypes = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTopNodeTypes)
    .map(([type, count]) => ({ type, count }));

  return {
    totalNodes,
    namedNodes,
    maxDepth,
    topNodeTypes,
    interestingNodes,
  };
}

function parseSourceChunked(parser: InstanceType<typeof Parser>, source: string) {
  const chunkSize = 16 * 1024;
  return parser.parse((index: number) => source.slice(index, index + chunkSize));
}

/**
 * Parse a source file with Tree-sitter and return the AST as S-expression string.
 * Supported extensions: .ts, .tsx, .js, .jsx, .mjs, .cjs, .c, .h, .cpp, .cc, .cxx, .c++, .hpp, .hxx.
 */
export function parseFileWithTreeSitter(
  filePath: string,
  options?: { summaryOnly?: boolean; maxTopNodeTypes?: number; maxInterestingNodes?: number },
): TreeSitterParseResult {
  const { resolved, relativeDisplay } = resolvePath(filePath);

  if (!fs.existsSync(resolved)) {
    return { ok: false, path: relativeDisplay, error: `File not found: ${resolved}` };
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    return { ok: false, path: relativeDisplay, error: `Not a file: ${resolved}` };
  }

  const lang = getLanguageForPath(resolved);
  if (!lang) {
    const ext = path.extname(resolved);
    return {
      ok: false,
      path: relativeDisplay,
      error: `Unsupported extension "${ext}". Supported: .ts, .tsx, .js, .jsx, .mjs, .cjs, .c, .h, .cpp, .cc, .cxx, .c++, .hpp, .hxx`,
    };
  }

  try {
    const source = fs.readFileSync(resolved, 'utf8');
    const parser = createParserForLang(lang);
    const tree = parseSourceChunked(parser, source);
    const summary = summarizeTree(
      tree.rootNode as TreeNodeLike,
      options?.maxTopNodeTypes,
      options?.maxInterestingNodes,
    );
    const ast = options?.summaryOnly ? undefined : tree.rootNode.toString();
    return { ok: true, path: relativeDisplay, language: lang, ast, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path: relativeDisplay, language: lang, error: message };
  }
}
