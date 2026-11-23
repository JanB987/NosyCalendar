import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
await import('./styles.mjs');

await mkdir('.test-build', { recursive: true });
await build({ entryPoints: ['tests/iso-weeks.test.ts'], outfile: '.test-build/iso-weeks.test.cjs', bundle: true, platform: 'node', format: 'cjs' });
for (const name of ['colors', 'color-editor']) await build({ entryPoints: [`tests/${name}.test.ts`], outfile: `.test-build/${name}.test.cjs`, bundle: true, platform: 'node', format: 'cjs', external: ['jsdom'], alias: { obsidian: './tests/obsidian-stub.ts' } });
await build({entryPoints:['tests/style-layout.test.ts'],outfile:'.test-build/style-layout.test.cjs',bundle:true,platform:'node',format:'cjs',external:['jsdom']});
await build({ entryPoints: ['tests/dates.test.ts'], outfile: '.test-build/dates.test.cjs', bundle: true, platform: 'node', format: 'cjs' });
await build({ entryPoints: ['tests/values.test.ts'], outfile: '.test-build/values.test.cjs', bundle: true, platform: 'node', format: 'cjs', alias: { obsidian: './tests/obsidian-stub.ts' } });
await build({ entryPoints: ['tests/writeback.test.ts'], outfile: '.test-build/writeback.test.cjs', bundle: true, platform: 'node', format: 'cjs' });
await build({ entryPoints: ['tests/resize.test.ts'], outfile: '.test-build/resize.test.cjs', bundle: true, platform: 'node', format: 'cjs' });
await build({ entryPoints: ['tests/roles.test.ts'], outfile: '.test-build/roles.test.cjs', bundle: true, platform: 'node', format: 'cjs' });
await build({ entryPoints: ['tests/rolling.test.ts'], outfile: '.test-build/rolling.test.cjs', bundle: true, platform: 'node', format: 'cjs' });
await build({ entryPoints: ['tests/clock.test.ts'], outfile: '.test-build/clock.test.cjs', bundle: true, platform: 'node', format: 'cjs' });
await build({ entryPoints: ['tests/editor.test.ts'], outfile: '.test-build/editor.test.cjs', bundle: true, platform: 'node', format: 'cjs',
  external: ['jsdom'], alias: { obsidian: './tests/obsidian-stub.ts' } });
await build({ entryPoints: ['tests/app.test.ts'], outfile: '.test-build/app.test.cjs', bundle: true, platform: 'node', format: 'cjs',
  external: ['jsdom'], alias: { obsidian: './tests/obsidian-stub.ts' } });
await build({ entryPoints: ['src/handles.ts'], outfile: '.test-build/handles.cjs', bundle: true, platform: 'node', format: 'cjs' });
await build({ entryPoints: ['tests/popout.test.ts'], outfile: '.test-build/popout.test.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['jsdom'], alias: { obsidian: './tests/obsidian-stub.ts', '@fullcalendar/core': './tests/calendar-stub.ts', '@fullcalendar/daygrid': './tests/plugin-stub.ts', '@fullcalendar/timegrid': './tests/plugin-stub.ts', '@fullcalendar/multimonth': './tests/plugin-stub.ts', '@fullcalendar/interaction': './tests/plugin-stub.ts' } });
await build({ entryPoints: ['tests/view.test.ts'], outfile: '.test-build/view.test.cjs', bundle: true, platform: 'node', format: 'cjs', alias: {
  obsidian: './tests/obsidian-stub.ts', '@fullcalendar/core': './tests/calendar-stub.ts',
  '@fullcalendar/daygrid': './tests/plugin-stub.ts', '@fullcalendar/timegrid': './tests/plugin-stub.ts',
  '@fullcalendar/multimonth': './tests/plugin-stub.ts', '@fullcalendar/interaction': './tests/plugin-stub.ts'
} });
for (const TZ of ['Europe/Berlin', 'UTC', 'America/New_York']) {
  console.log(`\nDate conversion checks: ${TZ}`);
  const result = spawnSync(process.execPath, ['--import', './tests/test-environment.mjs', '--test', 'tests/styles.test.mjs', '.test-build/style-layout.test.cjs', '.test-build/iso-weeks.test.cjs', '.test-build/colors.test.cjs', '.test-build/color-editor.test.cjs', '.test-build/dates.test.cjs', '.test-build/values.test.cjs', '.test-build/writeback.test.cjs', '.test-build/resize.test.cjs', '.test-build/roles.test.cjs', '.test-build/rolling.test.cjs', '.test-build/clock.test.cjs', '.test-build/editor.test.cjs', '.test-build/app.test.cjs', '.test-build/view.test.cjs', '.test-build/popout.test.cjs', 'tests/rendering.test.mjs'], {
    env: { ...process.env, TZ }, stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
