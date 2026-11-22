import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { styleSettingsHost, installed } from './style-settings-host.mjs';
import { numeric, colors, groups, prefix } from '../scripts/style-catalog.mjs';
test('installed Style Settings 1.0.9 discovers the shipped metadata with unique stable supported IDs', () => {
  const host = styleSettingsHost();
  try {
    assert.equal(JSON.parse(readFileSync(new URL('manifest.json', installed))).version,'1.0.9');
    const settings = host.config.settings;
    assert.equal(new Set(settings.map(s=>s.id)).size, settings.length);
    assert.ok(settings.every(s=>s.id.startsWith(prefix)));
    assert.equal(settings.filter(s=>s.type==='heading').length,10);
    for (const control of numeric) { assert.ok(control.default>=control.min && control.default<=control.max); assert.ok(control.step>0); }
    assert.equal(host.config.name,'NosyCalendar');
  } finally {host.close();}
});
test('installed Style Settings emits inherited numeric units, light/dark colors and Theme/Custom classes with native reset', () => {
  const host = styleSettingsHost();
  try {
    const chosen = {'nosy-calendar@@nosy-calendar-event-title-size':18,'nosy-calendar@@nosy-calendar-events-colors':'nosy-calendar-events-custom',
      'nosy-calendar@@nosy-calendar-event-fill@@light':'#123456','nosy-calendar@@nosy-calendar-event-fill@@dark':'#abcdef'};
    const output = host.apply(chosen);
    assert.match(output.css,/--nosy-calendar-event-title-size: 18px/);
    assert.match(output.css,/body.theme-light.css-settings-manager.*--nosy-calendar-event-fill: #123456/);
    assert.match(output.css,/body.theme-dark.css-settings-manager.*--nosy-calendar-event-fill: #abcdef/);
    assert.ok(output.classes.includes('nosy-calendar-events-custom'));
    const reset = host.apply({}); assert.ok(reset.classes.includes('nosy-calendar-events-theme'));
    assert.ok(!reset.css.includes('--nosy-calendar-event-title-size:'));
  } finally {host.close();}
});
test('every catalog variable is consumed; public defaults never shadow body inheritance; palettes are gated and scoped', () => {
  const css = readFileSync('styles.css','utf8').split('*/').slice(1).join('*/');
  for (const control of [...numeric,...colors]) assert.ok(css.includes(`var(--${control.id},`),control.id);
  assert.ok(!/--nosy-calendar-[\w-]+\s*:/.test(css),'public variables must only be inherited');
  for (const [group]of groups) assert.ok(css.includes(`body.theme-dark.css-settings-manager.${prefix}${group}-custom`));
});
