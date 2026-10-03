import type { OutputBundle, OutputChunk } from 'rollup';

/** Inspect actual Rollup module ownership, including every lazy descendant. */
export function inspectDomainBundles(bundle: OutputBundle) {
  const entries = Object.values(bundle).filter(
    (item): item is OutputChunk => item.type === 'chunk' && item.isEntry,
  );
  const result: Record<string, { files: string[]; modules: string[] }> = {};
  for (const [domain, suffix] of [
    ['hub', '/index.html'],
    ['2d', '/2d/index.html'],
    ['3d', '/3d/index.html'],
  ]) {
    const entry = entries.find((item) => {
      const id = item.facadeModuleId?.replaceAll('\\', '/') ?? '';
      return id.endsWith(suffix) && (domain !== 'hub' || !/\/(2d|3d)\/index\.html$/.test(id));
    });
    if (!entry) throw new Error(`Missing ${domain} build entry`);
    const files = new Set<string>();
    const modules = new Set<string>();
    const visit = (file: string) => {
      if (files.has(file)) return;
      files.add(file);
      const chunk = bundle[file];
      if (chunk?.type !== 'chunk') return;
      for (const id of Object.keys(chunk.modules)) modules.add(id.replaceAll('\\', '/'));
      // Vite emits worker URLs as string references rather than Rollup imports.
      for (const asset of Object.values(bundle)) {
        if (asset.type === 'asset' && chunk.code.includes(asset.fileName))
          files.add(asset.fileName);
      }
      const metadata = (
        chunk as OutputChunk & {
          viteMetadata?: { importedCss?: Set<string>; importedAssets?: Set<string> };
        }
      ).viteMetadata;
      for (const child of [
        ...chunk.imports,
        ...chunk.dynamicImports,
        ...chunk.referencedFiles,
        ...(metadata?.importedCss ?? []),
        ...(metadata?.importedAssets ?? []),
      ])
        visit(child);
    };
    visit(entry.fileName);
    const forbidden = [...modules].filter((id) => {
      if (domain === 'hub')
        return /\/src\/(core|features|app|workers|adapters3d)|\/node_modules\//.test(id);
      if (domain === '2d') return /\/src\/(core3d|adapters3d|features\/editor3d)\//.test(id);
      return /\/src\/(core|features\/(editor|home)|workers)\//.test(id);
    });
    if (forbidden.length)
      throw new Error(`${domain} imports another domain: ${forbidden.join(', ')}`);
    result[domain] = {
      files: [...files].sort(),
      modules: [...modules]
        .map((id) =>
          id.replace(process.cwd().replaceAll('\\', '/') + '/', '').replace('\0', 'virtual:'),
        )
        .sort(),
    };
  }
  return result;
}
