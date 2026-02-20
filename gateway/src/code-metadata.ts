/**
 * Extracts code metadata from source files for indexing: class names, property names,
 * and referenced types (other classes that compose or are used by this file).
 * Used to enrich payload so search and IA have structured context (file, class, properties, relations).
 */

export type CodeMetadata = {
  file_name: string;
  class_names: string[];
  property_names: string[];
  referenced_types: string[];
};

const CS_PRIMITIVES = new Set([
  'string', 'int', 'long', 'short', 'byte', 'bool', 'boolean', 'decimal', 'double', 'float',
  'object', 'void', 'var', 'dynamic', 'char', 'uint', 'ulong', 'ushort',
]);
const TS_PRIMITIVES = new Set([
  'string', 'number', 'boolean', 'void', 'any', 'unknown', 'null', 'undefined',
  'object', 'symbol', 'bigint', 'Array', 'Promise', 'Date', 'RegExp', 'Map', 'Set',
]);
const JAVA_PRIMITIVES = new Set([
  'int', 'long', 'short', 'byte', 'boolean', 'double', 'float', 'char', 'void',
  'String', 'Integer', 'Long', 'Boolean', 'Double', 'Float', 'Object', 'List', 'Set', 'Map',
]);

function uniqueSorted(arr: string[]): string[] {
  return [...new Set(arr)].filter(Boolean).sort();
}

function isPascalCase(s: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(s) && s.length > 1;
}

/** C#: class/interface, properties, and referenced types (from property/field types). */
function extractCSharp(content: string): Partial<CodeMetadata> {
  const classNames: string[] = [];
  const propertyNames: string[] = [];
  const referencedTypes: string[] = [];

  const classRe = /\b(?:class|interface|struct)\s+([A-Z][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = classRe.exec(content)) !== null) classNames.push(m[1]);

  // Properties: public Type Name { get; set; } or public Type Name => ...
  const propRe = /(?:public|protected|internal)\s+(?:static\s+)?(?:readonly\s+)?(?:virtual\s+)?[\w<>,\s\[\]?]+\s+([A-Z][a-zA-Z0-9_]*)\s*[\{\=]/g;
  while ((m = propRe.exec(content)) !== null) propertyNames.push(m[1]);

  // Field types and property types: word before property name (Type Name)
  const typeBeforeNameRe = /(?:public|protected|internal|private)\s+(?:static\s+)?(?:readonly\s+)?([A-Z][a-zA-Z0-9_<>,\s\[\]]+?)\s+[A-Z][a-zA-Z0-9_]*\s*[\{\=;]/g;
  while ((m = typeBeforeNameRe.exec(content)) !== null) {
    const typePart = m[1].replace(/\s+/g, ' ').trim();
    const genericMatch = typePart.match(/^([A-Z][a-zA-Z0-9_]*)/);
    const baseType = genericMatch ? genericMatch[1] : typePart.split(/[\s,<>\[\]]/)[0];
    if (baseType && isPascalCase(baseType) && !CS_PRIMITIVES.has(baseType)) referencedTypes.push(baseType);
  }

  // Generic types inside <> that look like classes
  const genericRe = /<([A-Z][a-zA-Z0-9_,\s]+)>/g;
  while ((m = genericRe.exec(content)) !== null) {
    m[1].split(/[,>\s]/).forEach((t) => {
      const t2 = t.trim();
      if (t2 && isPascalCase(t2) && !CS_PRIMITIVES.has(t2)) referencedTypes.push(t2);
    });
  }

  return {
    class_names: uniqueSorted(classNames),
    property_names: uniqueSorted(propertyNames),
    referenced_types: uniqueSorted(referencedTypes),
  };
}

/** TypeScript/JavaScript: class, class fields and constructor params, referenced types from annotations. */
function extractTypeScript(content: string): Partial<CodeMetadata> {
  const classNames: string[] = [];
  const propertyNames: string[] = [];
  const referencedTypes: string[] = [];

  const classRe = /\bclass\s+([A-Z][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = classRe.exec(content)) !== null) classNames.push(m[1]);

  // Class field: name: Type; or name!: Type; or name?: Type;
  const fieldRe = /^\s*(?:readonly\s+)?(?:private|public|protected)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*!?\s*:\s*([A-Z][a-zA-Z0-9_<>\[\]\s,|&]*?)\s*[;=]/gm;
  while ((m = fieldRe.exec(content)) !== null) {
    propertyNames.push(m[1]);
    const typeStr = m[2].trim();
    const base = typeStr.split(/[<\[|&\s]/)[0].trim();
    if (base && isPascalCase(base) && !TS_PRIMITIVES.has(base)) referencedTypes.push(base);
  }

  // this.prop = in constructor
  const thisPropRe = /this\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
  while ((m = thisPropRe.exec(content)) !== null) propertyNames.push(m[1]);

  // Constructor params with types: param: Type
  const ctorParamRe = /(?:constructor|function)\s*\([^)]*\)\s*\{/g;
  const ctorMatch = content.match(ctorParamRe);
  if (ctorMatch) {
    const ctorRe = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*([A-Z][a-zA-Z0-9_<>\[\]\s,|&]*?)(?:\s*[,\)])/g;
    let start = 0;
    ctorMatch.forEach(() => {
      const idx = content.indexOf('constructor', start);
      if (idx === -1) return;
      const slice = content.slice(idx, idx + 800);
      let pm: RegExpExecArray | null;
      while ((pm = ctorRe.exec(slice)) !== null) {
        propertyNames.push(pm[1]);
        const base = pm[2].split(/[<\[|&\s]/)[0].trim();
        if (base && isPascalCase(base) && !TS_PRIMITIVES.has(base)) referencedTypes.push(base);
      }
      start = idx + 1;
    });
  }

  return {
    class_names: uniqueSorted(classNames),
    property_names: uniqueSorted(propertyNames),
    referenced_types: uniqueSorted(referencedTypes),
  };
}

/** Java: class/interface, fields (and getter names as property hints), referenced types. */
function extractJava(content: string): Partial<CodeMetadata> {
  const classNames: string[] = [];
  const propertyNames: string[] = [];
  const referencedTypes: string[] = [];

  const classRe = /\b(?:class|interface|enum)\s+([A-Z][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = classRe.exec(content)) !== null) classNames.push(m[1]);

  // Field: private Type name; or protected Type name;
  const fieldRe = /(?:private|protected|public)\s+(?:static\s+)?(?:final\s+)?([A-Z][a-zA-Z0-9_<>,\s\[\]]+?)\s+([a-z][a-zA-Z0-9_]*)\s*;/g;
  while ((m = fieldRe.exec(content)) !== null) {
    propertyNames.push(m[2]);
    const typePart = m[1].replace(/\s+/g, ' ').trim();
    const base = typePart.split(/[<\[;\s]/)[0].trim();
    if (base && isPascalCase(base) && !JAVA_PRIMITIVES.has(base)) referencedTypes.push(base);
    const genericMatch = typePart.match(/<([A-Z][a-zA-Z0-9_,\s]+)>/);
    if (genericMatch) {
      genericMatch[1].split(/[,>\s]/).forEach((t) => {
        const t2 = t.trim();
        if (t2 && isPascalCase(t2) && !JAVA_PRIMITIVES.has(t2)) referencedTypes.push(t2);
      });
    }
  }

  // getX() / setX() as property name
  const getterRe = /(?:public|protected)\s+[\w<>,\s\[\]]+\s+(?:get|is)([A-Z][a-zA-Z0-9_]*)\s*\(/g;
  while ((m = getterRe.exec(content)) !== null) {
    const name = m[1].charAt(0).toLowerCase() + m[1].slice(1);
    if (!propertyNames.includes(name)) propertyNames.push(name);
  }

  return {
    class_names: uniqueSorted(classNames),
    property_names: uniqueSorted(propertyNames),
    referenced_types: uniqueSorted(referencedTypes),
  };
}

/** Extensions that we try to extract code metadata from. */
const CODE_EXTS: Record<string, (content: string) => Partial<CodeMetadata>> = {
  '.cs': extractCSharp,
  '.ts': extractTypeScript,
  '.tsx': extractTypeScript,
  '.js': extractTypeScript,
  '.jsx': extractTypeScript,
  '.mjs': extractTypeScript,
  '.cjs': extractTypeScript,
  '.java': extractJava,
};

/**
 * Extracts file_name, class_names, property_names, referenced_types from source code.
 * Returns null if the file extension is not supported or extraction yields nothing.
 */
export function extractCodeMetadata(content: string, fileName: string): CodeMetadata | null {
  const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : '';
  const extract = CODE_EXTS[ext];
  if (!extract) return null;

  try {
    const partial = extract(content);
    const file_name = fileName || 'unknown';
    const class_names = partial.class_names ?? [];
    const property_names = partial.property_names ?? [];
    const referenced_types = partial.referenced_types ?? [];
    if (class_names.length === 0 && property_names.length === 0 && referenced_types.length === 0) {
      return { file_name, class_names: [], property_names: [], referenced_types: [] };
    }
    return {
      file_name,
      class_names,
      property_names,
      referenced_types,
    };
  } catch {
    return null;
  }
}

/** Returns true if the file extension is one we extract metadata from. */
export function isCodeFileForMetadata(fileName: string): boolean {
  const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : '';
  return ext in CODE_EXTS;
}
