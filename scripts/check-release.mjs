import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { generateNotices } from './notices.mjs';

const json = async file => JSON.parse(await readFile(file, 'utf8'));
const manifest = await json('manifest.json'), pkg = await json('package.json'), lock = await json('package-lock.json');
assert.equal(manifest.id, 'nosy-calendar');
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(pkg.version, manifest.version);
assert.equal(lock.version, manifest.version);
assert.equal(lock.packages[''].version, manifest.version);
assert.equal((await json('versions.json'))[manifest.version], manifest.minAppVersion);
assert.equal((await json('tests/minimum-api/package.json')).devDependencies.obsidian, manifest.minAppVersion);
assert.deepEqual(await json('dist/manifest.json'), manifest);
if (process.env.RELEASE_TAG) assert.equal(process.env.RELEASE_TAG, manifest.version, 'Tag must be the bare manifest version.');
const notices = await generateNotices();
assert.equal((await readFile('THIRD-PARTY-NOTICES.txt', 'utf8')).replace(/\r\n/g, '\n'), notices);
assert.equal(await readFile('dist/THIRD-PARTY-NOTICES.txt', 'utf8'), notices);
const bundle = await readFile('dist/main.js', 'utf8');
assert.ok(bundle.startsWith(`/*!\n${notices.replaceAll('*/', '* /')}*/`), 'Installed JS must contain complete project and dependency licenses.');
assert.deepEqual(await readFile('dist/styles.css'), await readFile('styles.css'));
const meta = await json('dist/build-meta.json');
assert.ok(!Object.keys(meta.inputs).some(name => /(?:^|\/)(tests|\.test-build)\//.test(name)), 'No test fixtures in runtime bundle.');
const externals = new Set(Object.values(meta.outputs).flatMap(output => output.imports.filter(i => i.external).map(i => i.path)));
assert.deepEqual([...externals], ['obsidian'], 'Obsidian must be the only external runtime dependency.');
const syntax = spawnSync(process.execPath, ['--check', 'dist/main.js'], { stdio: 'inherit' });
assert.equal(syntax.status, 0, 'Production JS syntax check');
for (const file of ['main.js', 'manifest.json', 'styles.css', 'THIRD-PARTY-NOTICES.txt']) {
  console.log(`${createHash('sha256').update(await readFile(`dist/${file}`)).digest('hex')}  ${file}`);
}
console.log(`Release metadata, runtime dependency boundary, embedded licenses and syntax verified: ${manifest.version}.`);
