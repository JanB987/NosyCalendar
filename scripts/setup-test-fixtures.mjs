import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Test-only upstream release. Never imported by src/ or included in installed assets.
const files = {
  'main.js': '1828abaacdab4c5578b705a625c585b30512f8efad4c7cfc5a18e70cc3557468',
  'manifest.json': '9cffdc20cf2aa1354820e0050b694b0f9b576446e3d5d44a36ae8b0187e5bfb8'
};
const root = new URL('../.test-build/fixtures/style-settings/', import.meta.url);
const hash = data => createHash('sha256').update(data).digest('hex');
await mkdir(root, { recursive: true });
for (const [name, expected] of Object.entries(files)) {
  const target = new URL(name, root);
  let cached;
  try { cached = await readFile(target); } catch {}
  if (cached && hash(cached) === expected) continue;
  const response = await fetch(`https://github.com/community-archive/obsidian-style-settings/releases/download/1.0.9/${name}`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Style Settings fixture ${name}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (hash(data) !== expected) throw new Error(`Style Settings fixture checksum mismatch: ${name}`);
  await writeFile(target, data);
}
await copyFile(new URL('../tests/fixtures/style-settings-LICENSE.md', import.meta.url), new URL('LICENSE.md', root));
console.log('Verified test-only Style Settings 1.0.9 fixture (SHA-256).');
