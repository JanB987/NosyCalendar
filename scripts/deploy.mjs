import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const target = process.argv[2];
if (!target || path.basename(path.resolve(target)) !== 'nosy-calendar') throw new Error('Provide the explicit nosy-calendar deployment directory.');
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
if (manifest.id !== 'nosy-calendar') throw new Error('Unexpected plugin identity.');
await mkdir(target, { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css', 'THIRD-PARTY-NOTICES.txt']) {
  const source = path.join('dist', name), destination = path.join(target, name);
  await copyFile(source, destination);
  const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
  if (await hash(source) !== await hash(destination)) throw new Error(`Deployment verification failed: ${name}`);
  console.log(`Verified ${name}`);
}
console.log(`Deployed ${manifest.name} ${manifest.version} to ${target}`);
