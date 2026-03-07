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
  error?: string;
}

/**
 * Parse a source file with Tree-sitter and return the AST as S-expression string.
 * Supported extensions: .ts, .tsx, .js, .jsx, .mjs, .cjs, .c, .h, .cpp, .cc, .cxx, .c++, .hpp, .hxx.
 */
export function parseFileWithTreeSitter(filePath: string): TreeSitterParseResult {
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
    const tree = parser.parse(source);
    const ast = tree.rootNode.toString();
    return { ok: true, path: relativeDisplay, language: lang, ast };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path: relativeDisplay, language: lang, error: message };
  }
}
