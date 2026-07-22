import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const appOutput = resolve('dist');
const h3Output = resolve(process.env.PAGES_H3_SOURCE?.trim() || 'dist-h3');
const h3Target = resolve(appOutput, 'h3');

for (const requiredPath of [
  resolve(appOutput, 'index.html'),
  resolve(h3Output, 'index.html'),
  resolve(h3Output, 'publication.json'),
]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Missing Pages build input: ${requiredPath}`);
  }
}

rmSync(h3Target, { force: true, recursive: true });
cpSync(h3Output, h3Target, { recursive: true });

for (const requiredPath of [
  resolve(appOutput, 'index.html'),
  resolve(h3Target, 'index.html'),
  resolve(h3Target, 'publication.json'),
]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Missing assembled Pages file: ${requiredPath}`);
  }
}
