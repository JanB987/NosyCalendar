import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

await import('./check-release.mjs');
const { GITHUB_REPOSITORY: repo, GH_TOKEN: token, RELEASE_TAG: tag, GITHUB_SHA: sha } = process.env;
assert.equal(repo, 'JanB987/NosyCalendar');
assert.ok(token && tag && sha, 'Publication requires workflow credentials, tag and commit.');
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sha);
assert.equal(execFileSync('git', ['rev-list', '-n', '1', tag], { encoding: 'utf8' }).trim(), sha);
execFileSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main']);
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const base = `https://api.github.com/repos/${repo}/releases`;
const request = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`GitHub request failed: HTTP ${response.status} ${await response.text()}`);
  return response.json();
};
const existing = await fetch(`${base}/tags/${encodeURIComponent(tag)}`, { headers });
assert.equal(existing.status, 404, 'Refusing to replace an existing release (or proceed after an access failure).');
const body = await readFile(`docs/releases/${tag}.md`, 'utf8');
const release = await request(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: tag, target_commitish: sha, name: `NosyCalendar ${tag}`, body, draft: true, prerelease: false }) });
const upload = release.upload_url.split('{')[0];
assert.equal(new URL(upload).hostname, 'uploads.github.com');
for (const name of ['main.js', 'manifest.json', 'styles.css', 'THIRD-PARTY-NOTICES.txt']) {
  const data = await readFile(`dist/${name}`);
  const asset = await request(`${upload}?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: data });
  assert.equal(asset.state, 'uploaded');
  assert.equal(asset.size, data.length);
  if (asset.digest) assert.equal(asset.digest, `sha256:${createHash('sha256').update(data).digest('hex')}`);
  console.log(`Uploaded and verified ${name}`);
}
const published = await request(`${base}/${release.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false, prerelease: false, make_latest: 'true' }) });
assert.equal(published.draft, false);
assert.equal(published.prerelease, false);
console.log(`Published ${published.html_url} from ${sha}`);
