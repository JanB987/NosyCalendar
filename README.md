# NosyCalendar

An interactive calendar for **Obsidian Bases**. Show notes through configurable calendar roles, reschedule them by dragging, and keep overdue follow-ups visible.

<img width="691" height="988" alt="image" src="https://github.com/user-attachments/assets/11fb0365-60cc-43cf-a2c5-7d9b28e2f2fb" />


Features

- Week by default, with Day, Month and Year views.
- ISO week indicators in every view.
- Multiple roles per note, each with its own label, date properties, edge color and optional overdue rolling.
- Drag events to reschedule; resize either endpoint to change a range.
- Conditional fill colors using property = value or contains value rules.
- Date/time, whole-month/year and dated ISO-week support.
- Extensive appearance controls through the optional community Style Settings plugin.

<img width="677" height="978" alt="image" src="https://github.com/user-attachments/assets/12fd85df-34f9-4d39-b05d-f5fe49bb4e3c" />


## Requirements

- Obsidian 1.10.0 or later, with the Bases core plugin enabled.
- Community [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) to customize appearance; NosyCalendar works with its default styles without it.

Tested by the author on Windows desktop. Mobile/touch behavior has not yet been validated.

## Installation

Until NosyCalendar is listed in Obsidian's community directory:

1. Download main.js, manifest.json and styles.css from a published [GitHub release](https://github.com/JanB987/NosyCalendar/releases). Download the release assets, not GitHub's Source code ZIP.
2. Put them in your vault's .obsidian/plugins/nosy-calendar folder. Include THIRD-PARTY-NOTICES.txt when using the complete manual package.
3. Reload Obsidian and enable NosyCalendar under Community plugins.

## Quick start

1. Open a Base and select its **NosyCalendar** layout.
2. Use **Calendar roles** to add a role and choose its Start property. End is optional.
3. Add dates to properties on notes included by your Base.

For example:

~~~yaml
---
scheduled: 2026-11-23T10:00
deadline: 2026-11-23T11:00
status: Waiting
---
~~~

Map a role's Start to scheduled and End to deadline. Additional roles can use other properties on the same note.

Click an event to open its note. Body dragging changes its date; hovering reveals available endpoint handles. Resizing requires a writable End mapping and can create its value when that mapped property is empty.

<img width="685" height="939" alt="image" src="https://github.com/user-attachments/assets/88e86f56-32ed-4408-b718-455223abe9e2" />


## Roles, rolling and colors

Roles and fill rules are saved per Base view. A note can appear once for each role with a valid Start.

**Roll past dates to today** moves an overdue role's display forward without rewriting its dates. Ranges roll only after their entire range is past. Explicitly moving/resizing a rolled event saves the displayed result. Clear/reschedule its date or disable rolling to stop the reminder.

Use **Event colors** for ordered rules. First match wins. Text contains checks substrings; list contains checks a whole typed member. **Source values…** helps select exact list/link values; match counts help diagnose rules.

Role colors control edges; matching rules control fills. All events still come from the Base's filtered results.

<img width="679" height="972" alt="image" src="https://github.com/user-attachments/assets/4000c071-4f72-4da6-9af3-695287a688e0" />

## Dates and appearance

Supported examples include 2026, 2026-11, 2026-11-23, date-times with a space or T separator, and 2026W48 / 2026-W48. Partial dates cover their whole period; all-day End dates are inclusive. Timed entries without an End display for 30 minutes.

Appearance controls are under **Style Settings → NosyCalendar**. They apply across this vault's NosyCalendar views. Role mappings and fill rules remain per view.

<img width="675" height="655" alt="image" src="https://github.com/user-attachments/assets/95709a29-a05d-424c-90d6-0e5e8e3702a5" />

## Current limits

- Recurrence and event creation from calendar slots are not implemented.
- Derived formula/file date mappings are display-only.
- Partial-period body dragging is restricted; resizing can convert a period to exact dates.
- Rolling respects source Base filters and does not imply task completion.

## Development and feedback

See CONTRIBUTING.md for reproducible setup/checks and CHANGELOG.md for releases. Report issues with Obsidian/NosyCalendar versions, reproduction steps and relevant errors.


## Acknowledgments

This calendar is based on [FullCalendar Standard](https://github.com/fullcalendar/fullcalendar). 

## License

MIT. FullCalendar Standard and Preact retain their own notices; see THIRD-PARTY-NOTICES.txt.
