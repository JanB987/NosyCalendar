# Contributing

Use Node 22.14.0 (see `.node-version`) and npm. Source lives at the repository root. No Obsidian vault or installed plugins are needed for automated checks.

```sh
npm ci
npm run lint
npm run check:publication
npm test
npm run check:browser
npm run check:min-api
npm run typecheck
npm run build
npm run check:release
```

The browser checks require Chrome, Chromium or Edge. Set `BROWSER_EXECUTABLE` to the absolute executable path to override standard installation discovery. In PowerShell: `$env:BROWSER_EXECUTABLE = 'C:/path/to/chrome.exe'`; on Linux/macOS: `export BROWSER_EXECUTABLE=/path/to/chrome`. Checks fail if no browser is available; they are never silently skipped. A separate headless profile is created under `.test-build/`.

`npm test` and `npm run check:browser` automatically download the test-only Style Settings 1.0.9 release fixture and verify pinned SHA-256 hashes. Network access is required the first time. Its GPL-3.0 license is retained in `tests/fixtures/style-settings-LICENSE.md` and copied beside the downloaded files; upstream source is https://github.com/community-archive/obsidian-style-settings/tree/4ebec6ae0131a9d5e8307bb5e26d59db5ba2e81c. This fixture is evaluated only in an isolated test host and is never bundled with NosyCalendar.

`check:min-api` automatically installs its own locked Obsidian 1.10.0 declaration package under `tests/minimum-api/node_modules/`, avoiding incompatible peer requirements with the root Obsidian 1.14.4 API check (current when this release was prepared). No prefilled ignored files are needed. `npm run build` generates `styles.css`, notices and `dist/`; complete MIT project, FullCalendar Standard and Preact notices are embedded in `main.js` as well as provided separately.

Tests use synthetic notes. Include a minimal reproduction, versions, platform and relevant errors in issues; remove private note content. User acceptance inside Obsidian is separate from automated browser checks. The author performs Obsidian testing.

`npm run lint` uses pinned ESLint 9.39.5, typescript-eslint 8.73.0 and the official eslint-plugin-obsidianmd 0.6.0. ESLint 9 satisfies the official plugin's transitive peer requirements; ESLint 10 currently conflicts with them. The six targeted source rules are errors, run with real TypeScript type information, and include DOM creation, global/window context, unsafe arguments/member access and redundant assertions. The lint runner verifies that every production TypeScript file and manifest.json were visited with the required rules enabled. `check:publication` checks the exact manifest description and parses every declaration in all source/generated CSS, rejecting important declarations. These focused gates are not a claim of approval by the external community scanner.

Two-document tests model Obsidian's Node helpers and window ownership. View/header ownership is tested at the render callback boundary with a calendar double; real FullCalendar rendering and gestures are covered separately in JSDOM and an isolated Chromium-family browser. Native Obsidian popout acceptance still requires author testing.

## Releases

Keep `package.json`, lockfile, `manifest.json` and `versions.json` consistent. Update `CHANGELOG.md` and add `docs/releases/VERSION.md`. Run all checks from a clean checkout, review tracked contents, then commit to main and wait for CI. Create an unused bare version tag (for example `0.7.0`) at that exact main commit. Never replace tags or published assets; fixes receive a new version.

The release workflow validates the tagged checkout, rebuilds it, verifies metadata/licenses/syntax and publishes a normal GitHub release with `main.js`, `manifest.json`, `styles.css` and `THIRD-PARTY-NOTICES.txt`. It refuses an existing release. Write permission is limited to its publication job. Verify unauthenticated asset downloads and SHA-256 hashes after publication.
