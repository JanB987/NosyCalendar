# Changelog

## 0.7.1 — 2026-11-23

- Correct the manifest description reported by the community checker.
- Use Obsidian DOM helpers in editors and calendar render hooks while retaining document ownership, detached nodes and window-scoped ID generation.
- Guard unknown color-rule rows and nested literals before accessing fields; retain valid later rows, typed matching and saved IDs.
- Remove a redundant frontmatter assertion and replace important handle-hiding CSS with scoped specificity.
- Add pinned type-aware Obsidian linting, manifest/CSS CI checks, malformed-config and two-document regressions, and selected/focused/hovered continuation/mirror handle checks.

These are local validation results; the external community scanner and native Obsidian popout acceptance require a separate rescan/user test.

## 0.7.0 — 2026-11-22

First public release of NosyCalendar for Obsidian Bases (Obsidian 1.10.0+).

- Day, Week, Month and Year calendars with ISO week indicators.
- Multiple date roles per note, overdue rolling, conditional fills, drag rescheduling and endpoint resizing.
- Theme-aware appearance and optional Style Settings controls.
- Reproducible checks, release automation and complete installed project/dependency notices.

Recurrence and creating events from calendar slots are deferred. Author testing covers Windows desktop; mobile/touch behavior remains unvalidated.
