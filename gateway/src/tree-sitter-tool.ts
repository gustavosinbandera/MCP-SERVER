/**
 * Tree-sitter integration for MCP: parse source files and return AST (S-expression).
 * Supports TypeScript, TSX, JavaScript, JSX via tree-sitter grammars.
 */

import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Parser = require('tree-sitter') as typeof import('tree-sitter');
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import { getProjectRoot } from './config';

type LangKey = 'typescript' | 'tsx' | 'javascript';

const EXT_TO_LANG: Record<string, LangKey> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
};

function getLanguageForPath(filePath: string): LangKey | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_LANG[ext];
}

function createParserForLang(lang: LangKey): InstanceType<typeof Parser> {
  const parser = new Parser();
  if (lang === 'javascript') {
    parser.setLanguage(JavaScript);
  } else {
    // typescript | tsx
    const ts = TypeScript;
    parser.setLanguage(lang === 'tsx' ? ts.tsx : ts.typescript);
  }
  return parser;
}

/**
 * Resolve path: if relative, resolve against project root; otherwise use as-is (if absolute).
 */
function resolvePath(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (path.isAbsolute(trimmed)) return trimmed;
  return path.join(getProjectRoot(), trimmed);
}

export interface TreeSitterParseResult {
  ok: boolean;
  path: string;
  language?: LangKey;
  ast?: string;
  error?: string;
}

/**
 * Parse a source file with Tree-sitter and return the AST as S-expression string.
 * Supported extensions: .ts, .tsx, .js, .jsx, .mjs, .cjs.
 */
export function parseFileWithTreeSitter(filePath: string): TreeSitterParseResult {
  const resolved = resolvePath(filePath);
  const relativeDisplay = path.relative(getProjectRoot(), resolved);

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
      error: `Unsupported extension "${ext}". Supported: .ts, .tsx, .js, .jsx, .mjs, .cjs`,
    };
  }

  try {
    const source = fs.readFileSync(resolved, 'utf8');
    const parser = createParserForLang(lang);
    const tree = parser.parse(source);
    const ast = tree.rootNode.toString();
    return { ok: true, path: relativeDisplay, language: lang, ast };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path: relativeDisplay, language: lang, error: message };
  }
}
