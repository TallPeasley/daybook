# Daily brief file: `daybook-today.json`

Each morning a scheduled Claude task (the "Email Brief") reads the notes vault and emails a morning brief. As its last step it writes `Tools/brief/daybook-today.json` in the vault. `tools/refresh-daybook.mjs` picks it up and turns it into the Today and Updates tabs.

The file is used only when `date` is today, so a missed morning never shows yesterday's text as new.

| Key | Shape | Shown as |
|---|---|---|
| `date` | `"YYYY-MM-DD"` | (freshness check) |
| `dateLine` | string, e.g. `"Saturday, November 7, 2026 · Winter / Summer 2027"` | header date |
| `kpis` | 4-6 rows `[number, label, tone]`, tone `"good"`, `"hot"` or `""` | number tiles (tap to jump to the matching tab) |
| `glance` | 3-5 strings, simple HTML (`<b>`, `&amp;`) | "At a glance" |
| `attn` | rows `[title, detail]` | "Needs your attention", with Done ticks |
| `spot` | rows `[company, title, score or short label, why, applyUrl or ""]`, max 5 | Spotlight |
| `dead` | rows `[what, when]`, soonest first | Dated (also adds "closes ..." badges in Jobs) |
| `over` | rows `[what, detail]` | Overdue, for reference |
| `upd` | rows `[heading, htmlBody]` | Updates tab, one card per automation |
| `almost` | optional rows `[company, title fragment or "", next action]` | "Almost done" group at the top of Jobs |
| `leads` | optional `{id, n, d, w, s, x, date}` objects | Tutoring tab (ids stay the same day to day) |

Jobs and LinkedIn messages are not in this file. The refresh script reads them from the job tracker (`Tools/brief/q.json`, `jobsmd.json`) and from `Handoff/Pending-LinkedIn-Messages.md`.

## Taps flow back

Before writing the brief, the task reads `Handoff/Daybook-Ticks.md`, which the refresh script writes from the phone's taps (`/api/state`). Roles marked Applied or Skip and messages marked Sent are treated as the owner's word: they're reported back and dropped from the next day's lists.
