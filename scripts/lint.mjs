import { ESLint } from 'eslint';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const lint = new ESLint();
const sources = (await readdir('src', { recursive: true })).filter(name => name.endsWith('.ts')).map(name => `src/${name.replaceAll('\\', '/')}`);
const files = [...sources, 'manifest.json'];
const results = await lint.lintFiles(files);
assert.deepEqual(results.map(r => path.relative(process.cwd(), r.filePath).replaceAll('\\', '/')).sort(), [...files].sort(), 'Lint must actually visit all production source and the manifest.');
for (const file of files) {
  assert.equal(await lint.isPathIgnored(file), false, `${file} must not be ignored.`);
  const config = await lint.calculateConfigForFile(file);
  const rules = file === 'manifest.json' ? ['obsidianmd/validate-manifest'] : [
    'obsidianmd/prefer-create-el', 'obsidianmd/no-global-this', 'obsidianmd/prefer-active-doc',
    '@typescript-eslint/no-unsafe-argument', '@typescript-eslint/no-unsafe-member-access', '@typescript-eslint/no-unnecessary-type-assertion'
  ];
  for (const rule of rules) assert.equal(config.rules[rule][0], 2, `${rule} must remain an error in ${file}.`);
}
const formatter = await lint.loadFormatter('stylish');
const output = formatter.format(results);
if (output) console.log(output);
assert.equal(results.reduce((n, r) => n + r.errorCount + r.warningCount, 0), 0, 'Lint must have zero errors and warnings.');
console.log(`Type-aware scanner-rule lint checked ${sources.length} production TS files and manifest.json; no ignored affected files.`);
