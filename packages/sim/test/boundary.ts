// Static checks that keep packages/sim (and the shared code it imports) pure:
// no Phaser, no client code, no DOM or network globals, no unseeded randomness or wall clock.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export interface Violation {
  file: string;
  line: number;
  message: string;
}

export interface BoundaryRules {
  /** Relative imports must resolve inside one of these directories. */
  allowedRoots: string[];
  /** Bare module specifiers that may be imported. Everything else is rejected. */
  allowedPackages: string[];
}

/** Globals that mean rendering, DOM, network, wall-clock time or host access. */
export const FORBIDDEN_GLOBALS = new Set([
  'window', 'document', 'navigator', 'self', 'globalThis', 'location', 'localStorage',
  'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'Worker', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout',
  'setInterval', 'setImmediate', 'queueMicrotask', 'Date', 'process', 'require', 'crypto',
  'HTMLElement', 'HTMLCanvasElement', 'CanvasRenderingContext2D', 'Image', 'Audio',
  'Phaser', 'console',
]);

function isInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel));
}

/** Is this identifier used as a value reference (not a property name or declaration)? */
function isGlobalReference(node: ts.Identifier): boolean {
  const p = node.parent;
  if (!p) return true;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
  if (ts.isQualifiedName(p) && p.right === node) return false;
  if (
    (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) ||
      ts.isMethodDeclaration(p) || ts.isMethodSignature(p) || ts.isGetAccessor(p) ||
      ts.isSetAccessor(p) || ts.isEnumMember(p)) &&
    p.name === node
  ) {
    return false;
  }
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false;
  return true;
}

export function findViolations(fileName: string, source: string, rules: BoundaryRules): Violation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const out: Violation[] = [];
  const report = (node: ts.Node, message: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    out.push({ file: fileName, line: line + 1, message });
  };

  const checkSpecifier = (node: ts.Node, spec: string) => {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const target = resolve(dirname(fileName), spec);
      if (!rules.allowedRoots.some((root) => isInside(target, root))) {
        report(node, `import "${spec}" leaves the allowed sources`);
      }
    } else if (!rules.allowedPackages.includes(spec)) {
      report(node, `import of "${spec}" is not allowed (allowed: ${rules.allowedPackages.join(', ')})`);
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      checkSpecifier(node, node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      checkSpecifier(node, node.moduleReference.expression.text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      checkSpecifier(node, node.argument.literal.text);
    } else if (ts.isCallExpression(node)) {
      const arg = node.arguments[0];
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((isDynamicImport || isRequire) && arg) {
        if (ts.isStringLiteralLike(arg)) checkSpecifier(node, arg.text);
        else report(node, 'dynamic import with a non-literal specifier');
      }
    } else if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Math' &&
      node.name.text === 'random'
    ) {
      report(node, 'Math.random is not seeded; use the sim RNG');
    } else if (ts.isIdentifier(node) && FORBIDDEN_GLOBALS.has(node.text) && isGlobalReference(node)) {
      report(node, `forbidden global "${node.text}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listTsFiles(full));
    else if (/\.(c|m)?tsx?$/.test(entry)) files.push(full);
  }
  return files;
}

export function checkFiles(files: string[], rules: BoundaryRules): Violation[] {
  return files.flatMap((f) => findViolations(f, readFileSync(f, 'utf8'), rules));
}

/**
 * Type-check a tsconfig, optionally with extra in-memory files. Under the sim's tsconfig
 * (ES library only, no `types`), any use of DOM or Node APIs is a type error.
 */
export function compileDiagnostics(
  tsconfigPath: string,
  virtualFiles: Record<string, string> = {},
): { options: ts.CompilerOptions; messages: string[] } {
  const parsed = ts.getParsedCommandLineOfConfigFile(tsconfigPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    },
  });
  if (!parsed) throw new Error(`cannot read ${tsconfigPath}`);
  const host = ts.createCompilerHost(parsed.options);
  const norm = (p: string) => resolve(p).toLowerCase();
  const virtual = new Map(Object.entries(virtualFiles).map(([k, v]) => [norm(k), v]));
  const baseGetSourceFile = host.getSourceFile.bind(host);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);
  host.fileExists = (p) => virtual.has(norm(p)) || baseFileExists(p);
  host.readFile = (p) => virtual.get(norm(p)) ?? baseReadFile(p);
  host.getSourceFile = (p, lang, onError, create) => {
    const text = virtual.get(norm(p));
    return text !== undefined ? ts.createSourceFile(p, text, lang) : baseGetSourceFile(p, lang, onError, create);
  };
  const roots = [...parsed.fileNames, ...Object.keys(virtualFiles)];
  const program = ts.createProgram(roots, parsed.options, host);
  const messages = ts.getPreEmitDiagnostics(program).map((d) => {
    const text = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    if (!d.file || d.start === undefined) return text;
    const { line } = d.file.getLineAndCharacterOfPosition(d.start);
    return `${d.file.fileName}:${line + 1}: ${text}`;
  });
  return { options: parsed.options, messages };
}
