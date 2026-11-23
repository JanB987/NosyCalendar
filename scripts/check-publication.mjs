import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'postcss';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
assert.equal(manifest.description, 'Display calendar views for Bases with roles, conditional colors, ISO weeks and rescheduling.');
assert.ok(!/obsidian/i.test(manifest.description));
for (const file of ['styles.base.css', 'styles.visual.css', 'styles.css']) {
  let declarations = 0;
  parse(await readFile(file, 'utf8'), { from: file }).walkDecls(declaration => {
    declarations++;
    assert.equal(Boolean(declaration.important), false, `${file}: !important is not allowed (${declaration.prop}).`);
  });
  assert.ok(declarations > 0, `${file} must actually be parsed.`);
}
console.log('Manifest description and all project/generated CSS declarations checked.');
