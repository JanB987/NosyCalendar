import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { generateNotices } from './scripts/notices.mjs';

const notices = await generateNotices();
await mkdir('dist', { recursive: true });
const result = await build({
  entryPoints: ['src/main.ts'], outfile: 'dist/main.js', bundle: true,
  platform: 'browser', format: 'cjs', target: 'es2018', external: ['obsidian'],
  legalComments: 'inline', logLevel: 'info', metafile: true,
  banner: { js: `/*!\n${notices.replaceAll('*/', '* /')}*/` }
});
for (const name of ['manifest.json', 'styles.css']) await copyFile(name, `dist/${name}`);
await writeFile('THIRD-PARTY-NOTICES.txt', notices);
await writeFile('dist/THIRD-PARTY-NOTICES.txt', notices);
await writeFile('dist/build-meta.json', JSON.stringify(result.metafile, null, 2));
