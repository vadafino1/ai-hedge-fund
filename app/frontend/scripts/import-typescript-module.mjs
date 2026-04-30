import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export async function importTypeScriptModule(sourcePath, options = {}) {
  const resolvedSourcePath = path.resolve(sourcePath);
  const source = await readFile(resolvedSourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
    fileName: resolvedSourcePath,
  });

  const tempDir = path.resolve(
    'node_modules/.cache',
    options.tempDirName ?? 'ai-hedge-fund-typescript-module-test',
  );
  await mkdir(tempDir, { recursive: true });
  const modulePrefix = options.modulePrefix ?? path.basename(sourcePath, path.extname(sourcePath));
  const modulePath = path.join(tempDir, `${modulePrefix}-${Date.now()}.mjs`);
  await writeFile(modulePath, transpiled.outputText, 'utf8');
  return import(pathToFileURL(modulePath).href);
}
