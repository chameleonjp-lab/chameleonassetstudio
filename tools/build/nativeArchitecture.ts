import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** Source-level evidence only. This does not execute the app, bundles, workers or Mermaid. */
export type EdgeKind = 'runtime' | 'type' | 'worker' | 'asset';
export interface ArchitectureEdge {
  from: string;
  line: number;
  specifier: string;
  kind: EdgeKind;
  syntax: 'import' | 'export' | 'dynamic-import' | 'import-type' | 'worker-url' | 'asset-url';
  to?: string;
  external: boolean;
}
export interface ArchitectureIssue {
  file: string;
  line: number;
  code: string;
  detail: string;
}
export interface ArchitectureViolation extends ArchitectureIssue {
  kind: EdgeKind;
  /** A shortest local dependency path, not proof that this path executes. */
  via: string[];
}
export interface ArchitectureLink {
  file: string;
  line: number;
  target?: string;
  targetKind?: 'file' | 'directory' | 'unknown';
  status: 'exists' | 'missing' | 'external-unverified' | 'unsupported';
  anchor: 'absent' | 'unverified';
  query: 'absent' | 'unverified';
}
export interface ArchitectureDiagram {
  file: string;
  line: number;
  nodes: string[];
  edges: { from: string; to: string }[];
  /** Model feedback is informational; it is never an import-cycle finding. */
  feedbackCycles: string[][];
}
export interface NativeArchitectureInput {
  /** Repository-relative POSIX paths. Source text, not executable module objects. */
  files: Readonly<Record<string, string>>;
  /** Path existence; code targets must also be present in files to be inspected. */
  exists?: (repositoryPath: string) => boolean;
  pathKind?: (repositoryPath: string) => 'file' | 'directory' | undefined;
  roots?: readonly string[];
  consumerRoots?: readonly string[];
  documents?: readonly string[];
}
export const NATIVE_ARCHITECTURE_ROOTS = [
  'src/core3d',
  'src/adapters3d',
  'src/features/editor3d',
  'src/entries/3d.tsx',
  'src/entries/EntryBoundary.tsx',
] as const;
export const NATIVE_ARCHITECTURE_DOCUMENTS = [
  'README.md',
  'entries.md',
  'ownership.md',
  'dataflow.md',
  'lifecycle.md',
  'traceability.md',
  'review.md',
].map((name) => `docs/architecture/3d/${name}`);
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const EXCLUDED = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$|(?:^|\/)__tests__\/)/;
const isSource = (path: string) => SOURCE.test(path) && !EXCLUDED.test(path);
const within = (path: string, root: string) => path === root || path.startsWith(root + '/');
const isRepositoryPath = (path: string) =>
  !!path &&
  !path.includes('\\') &&
  !posix.isAbsolute(path) &&
  !/^[a-z]+:/i.test(path) &&
  path !== '..' &&
  !path.startsWith('../') &&
  posix.normalize(path) === path;
const safeTarget = (target: string) =>
  target.startsWith('/') || /^(?:[a-z]:[\\/]|file:)/i.test(target) ? '[absolute target]' : target;
const lineAt = (text: string, position: number) => text.slice(0, position).split('\n').length;

/** Sorted strongly connected components. A component is not an enumeration of all cycles. */
function cycleGroups(nodes: Iterable<string>, edges: { from: string; to: string }[]) {
  const adjacent = new Map<string, string[]>();
  for (const node of nodes) adjacent.set(node, []);
  for (const edge of edges) {
    if (!adjacent.has(edge.from)) adjacent.set(edge.from, []);
    if (!adjacent.has(edge.to)) adjacent.set(edge.to, []);
    adjacent.get(edge.from)!.push(edge.to);
  }
  let next = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const result: string[][] = [];
  const visit = (node: string) => {
    indices.set(node, next);
    low.set(node, next++);
    stack.push(node);
    active.add(node);
    for (const child of adjacent.get(node) ?? []) {
      if (!indices.has(child)) {
        visit(child);
        low.set(node, Math.min(low.get(node)!, low.get(child)!));
      } else if (active.has(child)) low.set(node, Math.min(low.get(node)!, indices.get(child)!));
    }
    if (low.get(node) !== indices.get(node)) return;
    const group: string[] = [];
    let child: string;
    do {
      child = stack.pop()!;
      active.delete(child);
      group.push(child);
    } while (child !== node);
    if (group.length > 1 || adjacent.get(node)?.includes(node)) result.push(group.sort());
  };
  for (const node of [...adjacent.keys()].sort()) if (!indices.has(node)) visit(node);
  return result.sort((a, b) => a.join('\n').localeCompare(b.join('\n')));
}

function resolveModule(from: string, specifier: string, exists: (path: string) => boolean) {
  const bare = specifier.split(/[?#]/, 1)[0];
  const base = posix.normalize(posix.join(posix.dirname(from), bare));
  if (!isRepositoryPath(base)) return undefined;
  const candidates = [base];
  // Match the project's TS/bundler extension convention, including JS-written TS imports.
  if (/\.[cm]?jsx?$/.test(base)) {
    const stem = base.replace(/\.[cm]?jsx?$/, '');
    const extensions = base.endsWith('.mjs')
      ? ['.mts', '.d.mts']
      : base.endsWith('.cjs')
        ? ['.cts', '.d.cts']
        : ['.ts', '.tsx', '.d.ts'];
    candidates.unshift(...extensions.map((ext) => stem + ext));
  }
  if (!SOURCE.test(base)) {
    candidates.push(
      ...['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.d.ts'].map(
        (ext) => base + ext,
      ),
    );
    candidates.push(...['.ts', '.tsx', '.js', '.jsx', '.d.ts'].map((ext) => base + '/index' + ext));
  }
  return candidates.find(exists);
}

function parseSource(file: string, text: string, issues: ArchitectureIssue[]) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const parsed = ast as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] };
  for (const diagnostic of parsed.parseDiagnostics) {
    issues.push({
      file,
      line: lineAt(text, diagnostic.start ?? 0),
      code: 'source-parse-error',
      detail: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    });
  }
  const edges: ArchitectureEdge[] = [];
  const issue = (node: ts.Node, detail: string) =>
    issues.push({
      file,
      line: lineAt(text, node.getStart(ast)),
      code: 'unsupported-source-target',
      detail,
    });
  const literal = (node: ts.Node | undefined) =>
    node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      ? node.text
      : undefined;
  const browserGlobals = new Set(['window', 'globalThis', 'self']);
  const constructorName = (expression: ts.Expression): string | undefined => {
    if (ts.isParenthesizedExpression(expression)) return constructorName(expression.expression);
    if (ts.isIdentifier(expression)) return expression.text;
    if (
      (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) &&
      ts.isIdentifier(expression.expression) &&
      browserGlobals.has(expression.expression.text)
    ) {
      return ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : literal(expression.argumentExpression);
    }
    return undefined;
  };
  const add = (
    node: ts.Node,
    target: ts.Node | undefined,
    kind: EdgeKind,
    syntax: ArchitectureEdge['syntax'],
  ) => {
    const specifier = literal(target);
    if (specifier === undefined) return issue(node, `${syntax}: expected a literal target`);
    edges.push({
      from: file,
      line: lineAt(text, node.getStart(ast)),
      specifier: safeTarget(specifier),
      kind,
      syntax,
      external: !/^\.{1,2}\//.test(specifier),
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const named = bindings && ts.isNamedImports(bindings) ? bindings.elements : undefined;
      const onlyTypes =
        clause?.isTypeOnly ||
        (!clause?.name && !!named?.length && named.every((item) => item.isTypeOnly));
      add(node, node.moduleSpecifier, onlyTypes ? 'type' : 'runtime', 'import');
      if (!onlyTypes && named?.some((item) => item.isTypeOnly))
        add(node, node.moduleSpecifier, 'type', 'import');
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const named =
        node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements
          : undefined;
      const onlyTypes =
        node.isTypeOnly || (!!named?.length && named.every((item) => item.isTypeOnly));
      add(node, node.moduleSpecifier, onlyTypes ? 'type' : 'runtime', 'export');
      if (!onlyTypes && named?.some((item) => item.isTypeOnly))
        add(node, node.moduleSpecifier, 'type', 'export');
    } else if (ts.isImportTypeNode(node)) {
      add(
        node,
        ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined,
        'type',
        'import-type',
      );
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node, node.arguments[0], 'runtime', 'dynamic-import');
    } else if (ts.isImportEqualsDeclaration(node)) {
      issue(node, 'import-equals is outside the supported ESM subset');
    } else if (
      ts.isCallExpression(node) &&
      ['require', 'importScripts'].includes(constructorName(node.expression) ?? '')
    ) {
      issue(node, 'CommonJS/importScripts dependency loading is unsupported');
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ['glob', 'globEager'].includes(node.expression.name.text) &&
      node.expression.expression.getText(ast) === 'import.meta'
    ) {
      issue(node, 'import.meta glob targets are unsupported');
    } else if (
      ts.isNewExpression(node) &&
      ['Worker', 'SharedWorker'].includes(constructorName(node.expression) ?? '')
    ) {
      const url = node.arguments?.[0];
      if (
        !url ||
        !ts.isNewExpression(url) ||
        constructorName(url.expression) !== 'URL' ||
        url.arguments?.[1]?.getText(ast) !== 'import.meta.url'
      ) {
        issue(node, 'worker: expected new URL(literal, import.meta.url)');
      } else add(node, url.arguments[0], 'worker', 'worker-url');
      // The nested URL is already accounted for as a worker, not as an asset.
      for (const argument of node.arguments?.slice(1) ?? []) visit(argument);
      return;
    } else if (
      ts.isNewExpression(node) &&
      constructorName(node.expression) === 'URL' &&
      node.arguments?.[1]?.getText(ast) === 'import.meta.url'
    ) {
      add(node, node.arguments[0], 'asset', 'asset-url');
    } else if (
      ts.isNewExpression(node) &&
      ((ts.isPropertyAccessExpression(node.expression) &&
        ['Worker', 'SharedWorker'].includes(node.expression.name.text)) ||
        (ts.isElementAccessExpression(node.expression) &&
          (['Worker', 'SharedWorker'].includes(literal(node.expression.argumentExpression) ?? '') ||
            (ts.isIdentifier(node.expression.expression) &&
              browserGlobals.has(node.expression.expression.text)))))
    ) {
      issue(node, 'Unsupported qualified or computed browser constructor');
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return edges;
}

function inspectDiagram(
  file: string,
  line: number,
  lines: string[],
  issues: ArchitectureIssue[],
): ArchitectureDiagram {
  const definitions = new Set<string>();
  const references: { id: string; line: number }[] = [];
  const edges: { from: string; to: string }[] = [];
  let header = false;
  const problem = (at: number, code: string, detail: string) =>
    issues.push({ file, line: at, code, detail });
  for (let index = 0; index < lines.length; index++) {
    let rest = lines[index].trim();
    const at = line + index + 1;
    if (!rest || rest.startsWith('%%')) continue;
    if (!header) {
      header = true;
      if (!/^flowchart (?:TD|TB|LR|RL|BT)$/.test(rest))
        problem(at, 'unsupported-mermaid-syntax', 'Expected a simple flowchart direction');
      continue;
    }
    const node = () => {
      const match = /^([A-Z][A-Z0-9_]*)(?:\["([^"\n]*)"\])?/.exec(rest);
      if (!match) return undefined;
      rest = rest.slice(match[0].length).trim();
      const id = match[1];
      if (match[2] !== undefined) {
        if (definitions.has(id)) problem(at, 'duplicate-mermaid-node', id);
        definitions.add(id);
      }
      references.push({ id, line: at });
      return id;
    };
    let previous = node();
    if (!previous) {
      problem(
        at,
        'unsupported-mermaid-syntax',
        'Expected an uppercase node ID and optional quoted bracket label',
      );
      continue;
    }
    while (rest) {
      const arrow = /^-->(?:\|(?:"[^"\n]*"|[^|"\n]+)\|)?\s*/.exec(rest);
      if (!arrow) break;
      rest = rest.slice(arrow[0].length);
      const next = node();
      if (!next) {
        problem(at, 'unsupported-mermaid-syntax', 'Arrow is missing its target node');
        break;
      }
      edges.push({ from: previous, to: next });
      previous = next;
    }
    if (rest)
      problem(
        at,
        'unsupported-mermaid-syntax',
        'Only declared nodes, --> arrows and optional |labels| are checked',
      );
  }
  if (!header) problem(line, 'unsupported-mermaid-syntax', 'Missing flowchart header');
  for (const reference of references)
    if (!definitions.has(reference.id))
      problem(reference.line, 'undeclared-mermaid-node', reference.id);
  return {
    file,
    line,
    nodes: [...definitions].sort(),
    edges,
    feedbackCycles: cycleGroups(definitions, edges),
  };
}

function inspectDocument(
  file: string,
  text: string,
  exists: (path: string) => boolean,
  pathKind: (path: string) => 'file' | 'directory' | undefined,
  issues: ArchitectureIssue[],
) {
  const links: ArchitectureLink[] = [];
  const diagrams: ArchitectureDiagram[] = [];
  const lines = text.split('\n');
  let fence: { marker: string; line: number; mermaid: boolean; lines: string[] } | undefined;
  const visible = lines
    .map((line, index) => {
      const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (
          marker &&
          marker[1][0] === fence.marker[0] &&
          marker[1].length >= fence.marker.length &&
          !marker[2].trim()
        ) {
          if (fence.mermaid) diagrams.push(inspectDiagram(file, fence.line, fence.lines, issues));
          fence = undefined;
        } else fence.lines.push(line);
        return '';
      }
      if (marker) {
        if (/^mermaid\b/i.test(marker[2].trim()) && marker[2].trim() !== 'mermaid') {
          issues.push({
            file,
            line: index + 1,
            code: 'unsupported-mermaid-syntax',
            detail: 'Only a plain lowercase mermaid fence is supported',
          });
        }
        fence = {
          marker: marker[1],
          line: index + 1,
          mermaid: marker[2].trim() === 'mermaid',
          lines: [],
        };
        return '';
      }
      // Historical/planned paths in code spans are prose, not file links.
      return line.replace(/(`+)([^`]*?)\1/g, (match) => ' '.repeat(match.length));
    })
    .join('\n');
  if (fence)
    issues.push({
      file,
      line: fence.line,
      code: 'unclosed-markdown-fence',
      detail: 'Unclosed fenced block',
    });
  const check = (href: string, line: number) => {
    const anchor = href.includes('#') ? 'unverified' : 'absent';
    const query = href.includes('?') ? 'unverified' : 'absent';
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) {
      links.push({ file, line, status: 'external-unverified', anchor, query });
      return;
    }
    let path: string;
    try {
      path = decodeURIComponent(href.split(/[?#]/, 1)[0]);
    } catch {
      path = '[invalid encoding]';
    }
    const target = path ? posix.normalize(posix.join(posix.dirname(file), path)) : file;
    if (
      path === '[invalid encoding]' ||
      path.startsWith('/') ||
      path.includes('\\') ||
      !isRepositoryPath(target)
    ) {
      links.push({ file, line, status: 'unsupported', anchor, query });
      issues.push({
        file,
        line,
        code: 'unsupported-markdown-link',
        detail: 'Invalid or non-repository-relative link target',
      });
      return;
    }
    const present = exists(target);
    links.push({
      file,
      line,
      target,
      targetKind: present ? (pathKind(target) ?? 'unknown') : undefined,
      status: present ? 'exists' : 'missing',
      anchor,
      query,
    });
    if (!present) issues.push({ file, line, code: 'missing-markdown-target', detail: target });
  };
  const readDestination = (raw: string, line: number) => {
    const match = /^(?:<([^<>]*)>|(\S+?))(?:\s+["'][^\n]*["'])?$/.exec(raw.trim());
    if (match) check(match[1] ?? match[2], line);
    else
      issues.push({
        file,
        line,
        code: 'unsupported-markdown-link',
        detail: 'Expected a simple link destination and optional quoted title',
      });
  };
  // Balanced parentheses permit filenames/URLs containing parentheses. This is not a full Markdown parser.
  const inline = /!?\[[^\]\n]*\]\(/g;
  let match: RegExpExecArray | null;
  while ((match = inline.exec(visible))) {
    let end = inline.lastIndex;
    let depth = 1;
    for (; end < visible.length && visible[end] !== '\n' && depth; end++) {
      if (visible[end] === '\\') {
        end++;
        continue;
      }
      if (visible[end] === '(') depth++;
      if (visible[end] === ')') depth--;
    }
    const line = lineAt(visible, match.index);
    if (depth)
      issues.push({
        file,
        line,
        code: 'unsupported-markdown-link',
        detail: 'Unclosed inline link destination',
      });
    else readDestination(visible.slice(inline.lastIndex, end - 1), line);
    inline.lastIndex = end;
  }
  const references = new Map<string, string>();
  const normalizeReference = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  for (const definition of visible.matchAll(/^\s*\[([^\]\n]+)\]:\s*(.+)$/gm)) {
    references.set(normalizeReference(definition[1]), definition[2]);
    readDestination(definition[2], lineAt(visible, definition.index!));
  }
  for (const reference of visible.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
    const id = normalizeReference(reference[2] || reference[1]);
    if (!references.has(id))
      issues.push({
        file,
        line: lineAt(visible, reference.index!),
        code: 'missing-markdown-reference',
        detail: id,
      });
  }
  return { links, diagrams };
}

/** Pure deterministic analysis. All I/O is injected; no browser, network or module execution. */
export function analyzeNativeArchitecture(input: NativeArchitectureInput) {
  const paths = Object.keys(input.files).sort();
  if (paths.some((path) => !isRepositoryPath(path)))
    throw new Error('File map keys must be normalized repository-relative POSIX paths');
  const pathKind = (path: string) =>
    input.pathKind?.(path) ??
    (Object.hasOwn(input.files, path)
      ? 'file'
      : paths.some((key) => key.startsWith(path + '/'))
        ? 'directory'
        : undefined);
  const exists = input.exists ?? ((path: string) => pathKind(path) !== undefined);
  const fileExists = (path: string) => exists(path) && pathKind(path) !== 'directory';
  const issues: ArchitectureIssue[] = [];
  const expand = (roots: readonly string[]) =>
    roots.flatMap((root) => {
      if (!isRepositoryPath(root))
        throw new Error('Roots must be normalized repository-relative POSIX paths');
      const found = paths.filter((path) => within(path, root) && isSource(path));
      if (!found.length)
        issues.push({
          file: root,
          line: 1,
          code: 'missing-source-root',
          detail: 'No production source text supplied for this root',
        });
      return found;
    });
  const productRoots = [...new Set(expand(input.roots ?? NATIVE_ARCHITECTURE_ROOTS))].sort();
  const consumerRoots = [
    ...new Set(expand(input.consumerRoots ?? ['tools/3d-consumer/main.ts'])),
  ].sort();
  const queue = [...new Set([...productRoots, ...consumerRoots])];
  const inspected = new Set<string>();
  const edges: ArchitectureEdge[] = [];
  for (let index = 0; index < queue.length; index++) {
    const file = queue[index];
    if (inspected.has(file)) continue;
    inspected.add(file);
    for (const edge of parseSource(file, input.files[file], issues)) {
      if (edge.external) {
        if (
          !/^(?:@[^/]+\/)?[a-z\d][\w.-]*(?:\/[\w./-]+)*$/i.test(edge.specifier) &&
          !edge.specifier.startsWith('node:')
        ) {
          issues.push({
            file,
            line: edge.line,
            code: 'unsupported-module-specifier',
            detail: safeTarget(edge.specifier),
          });
        }
      } else {
        edge.to = resolveModule(file, edge.specifier, fileExists);
        const suffix = edge.specifier.match(/[?#].*$/)?.[0];
        if (suffix)
          issues.push({
            file,
            line: edge.line,
            code: 'unsupported-module-suffix',
            detail: 'Import query/hash transforms are outside the source graph model',
          });
        if (!edge.to)
          issues.push({
            file,
            line: edge.line,
            code: 'unresolved-relative-import',
            detail: edge.specifier,
          });
        else if (EXCLUDED.test(edge.to)) {
          if (edge.kind !== 'type')
            issues.push({
              file,
              line: edge.line,
              code: 'excluded-runtime-target',
              detail: edge.to,
            });
        } else if (isSource(edge.to) && edge.kind !== 'asset') {
          if (Object.hasOwn(input.files, edge.to)) queue.push(edge.to);
          else issues.push({ file, line: edge.line, code: 'missing-source-text', detail: edge.to });
        } else if (edge.kind !== 'type' && edge.kind !== 'worker') edge.kind = 'asset';
        if (edge.kind === 'worker' && edge.to && !isSource(edge.to))
          issues.push({
            file,
            line: edge.line,
            code: 'unsupported-worker-target',
            detail: edge.to,
          });
      }
      edges.push(edge);
    }
  }
  edges.sort(
    (a, b) => a.from.localeCompare(b.from) || a.line - b.line || a.kind.localeCompare(b.kind),
  );
  const local = edges.filter(
    (edge): edge is ArchitectureEdge & { to: string } =>
      !!edge.to && isSource(edge.to) && edge.kind !== 'asset',
  );
  const runtime = local.filter((edge) => edge.kind === 'runtime');
  const typeEdges = local.filter((edge) => edge.kind === 'type');
  const runtimeCycles = cycleGroups(inspected, runtime);
  const typeOnlyCycles = cycleGroups(inspected, typeEdges);
  const typeInvolvingCycles = cycleGroups(inspected, [...runtime, ...typeEdges]).filter((group) =>
    typeEdges.some((edge) => group.includes(edge.from) && group.includes(edge.to)),
  );
  const workerDependencyCycles = cycleGroups(
    inspected,
    local.filter((edge) => edge.kind !== 'type'),
  ).filter((group) =>
    local.some(
      (edge) => edge.kind === 'worker' && group.includes(edge.from) && group.includes(edge.to),
    ),
  );
  const violations: ArchitectureViolation[] = [];
  const bySource = new Map<string, ArchitectureEdge[]>();
  for (const edge of edges) bySource.set(edge.from, [...(bySource.get(edge.from) ?? []), edge]);
  const productSources = new Set(productRoots);
  for (const file of productSources) {
    for (const edge of bySource.get(file) ?? []) {
      if (edge.to && isSource(edge.to) && edge.kind !== 'asset') productSources.add(edge.to);
    }
  }
  const enforce = (
    code: string,
    roots: string[],
    forbidden: (edge: ArchitectureEdge) => boolean,
  ) => {
    const seen = new Set<string>();
    const pending = roots.map((path) => [path]);
    for (let index = 0; index < pending.length; index++) {
      const via = pending[index];
      const file = via[via.length - 1];
      if (seen.has(file)) continue;
      seen.add(file);
      for (const edge of bySource.get(file) ?? []) {
        if (forbidden(edge))
          violations.push({
            file,
            line: edge.line,
            code,
            detail: edge.to ?? edge.specifier,
            kind: edge.kind,
            via: [...via, ...(edge.to ? [edge.to] : [])],
          });
        if (edge.to && isSource(edge.to) && edge.kind !== 'asset') pending.push([...via, edge.to]);
      }
    }
  };
  const ui = (path: string) => /^(?:src\/(?:features|app|entries)\/)/.test(path);
  const twoD = (path: string) =>
    /^src\/(?:core|features\/(?:editor|home)|workers|renderers\/canvas2d)\//.test(path) ||
    /^src\/entries\/(?:2d|hub)\.tsx$/.test(path);
  const babylon = (specifier: string) =>
    /^(?:@babylonjs\/|babylonjs(?:-gltf2interface)?(?:\/|$))/.test(specifier);
  enforce(
    'core-boundary',
    [...productSources].filter((path) => within(path, 'src/core3d')),
    (edge) =>
      edge.to
        ? within(edge.to, 'src/adapters3d') || ui(edge.to) || twoD(edge.to)
        : /^(?:react(?:-dom)?|three)(?:\/|$)/.test(edge.specifier) || babylon(edge.specifier),
  );
  enforce(
    'adapter-ui-boundary',
    [...productSources].filter((path) => within(path, 'src/adapters3d')),
    (edge) => !!edge.to && ui(edge.to),
  );
  enforce('three-d-to-two-d', productRoots, (edge) => !!edge.to && twoD(edge.to));
  enforce('consumer-in-product', productRoots, (edge) =>
    edge.to ? within(edge.to, 'tools/3d-consumer') : babylon(edge.specifier),
  );
  enforce('product-in-consumer', consumerRoots, (edge) => !!edge.to && within(edge.to, 'src'));
  const links: ArchitectureLink[] = [];
  const diagrams: ArchitectureDiagram[] = [];
  const documents = [...(input.documents ?? NATIVE_ARCHITECTURE_DOCUMENTS)].sort();
  for (const file of documents) {
    if (!isRepositoryPath(file))
      throw new Error('Documents must be normalized repository-relative POSIX paths');
    if (!Object.hasOwn(input.files, file))
      issues.push({
        file,
        line: 1,
        code: 'missing-document',
        detail: 'Document text was not supplied',
      });
    else {
      const document = inspectDocument(file, input.files[file], exists, pathKind, issues);
      links.push(...document.links);
      diagrams.push(...document.diagrams);
    }
  }
  issues.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code),
  );
  violations.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code),
  );
  return {
    schemaVersion: 1,
    ok: !issues.length && !violations.length && !runtimeCycles.length,
    scope: { productRoots, consumerRoots, documents, inspectedSources: [...inspected].sort() },
    summary: {
      sources: inspected.size,
      edges: edges.length,
      relativeEdges: edges.filter((edge) => !edge.external).length,
      runtimeEdges: edges.filter((edge) => edge.kind === 'runtime').length,
      typeEdges: edges.filter((edge) => edge.kind === 'type').length,
      workerEdges: edges.filter((edge) => edge.kind === 'worker').length,
      assetEdges: edges.filter((edge) => edge.kind === 'asset').length,
      documents: documents.length,
      links: links.length,
      diagrams: diagrams.length,
    },
    edges,
    issues,
    violations,
    runtimeCycles,
    typeOnlyCycles,
    typeInvolvingCycles,
    workerDependencyCycles,
    links,
    diagrams,
    limitations: [
      'Static source dependency evidence only; no bundle, network, runtime, visual or physical-device acceptance.',
      'ESM syntax-level runtime edges are conservative: no type-checker import elision, tree shaking or execution-order proof.',
      'Runtime cycle groups include literal dynamic imports, exclude worker boundaries, and do not enumerate every cycle.',
      'Type-only and type-involving cycle groups are informational; worker dependency cycles are not same-realm import cycles.',
      'External package internals, package availability, aliases, glob imports and query/hash import transforms are not resolved.',
      'Worker/URL constructors support direct names and window/globalThis/self qualification; constructor aliases and arbitrary computed loading are not resolved.',
      'Non-code assets are checked for existence only; CSS imports/URLs and generated dependencies are not traversed.',
      'Markdown checks cover simple inline links and reference definitions, not full Markdown/HTML grammar, heading anchors, query behavior or external URL reachability.',
      'Mermaid checks cover simple uppercase declared nodes and --> edges only, not full Mermaid grammar or rendering; feedback-cycle intent requires review.',
    ],
  };
}

/** Read-only collector for the current checkout. Symlinked directories are not traversed. */
export function collectNativeArchitecture(repositoryRoot: string): NativeArchitectureInput {
  const root = realpathSync(repositoryRoot);
  const files: Record<string, string> = {};
  const pathKind = (path: string) => {
    if (!isRepositoryPath(path)) return undefined;
    const absolute = join(root, path);
    if (!existsSync(absolute)) return undefined;
    const real = realpathSync(absolute);
    if (real !== root && !real.startsWith(root + '/')) return undefined;
    const stat = statSync(real);
    return stat.isDirectory()
      ? ('directory' as const)
      : stat.isFile()
        ? ('file' as const)
        : undefined;
  };
  const exists = (path: string) => pathKind(path) !== undefined;
  const walk = (path: string) => {
    if (!existsSync(join(root, path))) return;
    for (const entry of readdirSync(join(root, path), { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const child = posix.join(path, entry.name);
      if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) walk(child);
      else if (entry.isFile() && isSource(child))
        files[child] = readFileSync(join(root, child), 'utf8');
    }
  };
  walk('src');
  walk('tools');
  for (const file of NATIVE_ARCHITECTURE_DOCUMENTS)
    if (pathKind(file) === 'file') files[file] = readFileSync(join(root, file), 'utf8');
  return { files, exists, pathKind };
}

// Importing the pure API never runs the CLI. No writes, cleanup, subprocesses or network calls.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some((argument) => argument !== '--json')) {
    process.stderr.write(
      'Usage: node --experimental-strip-types tools/build/nativeArchitecture.ts [--json]\n',
    );
    process.exitCode = 2;
  } else {
    const report = analyzeNativeArchitecture(
      collectNativeArchitecture(resolve(dirname(fileURLToPath(import.meta.url)), '../..')),
    );
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exitCode = report.ok ? 0 : 1;
  }
}
