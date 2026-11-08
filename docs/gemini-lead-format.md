# Live tutoring leads from Gemini

A Gemini scheduled task checks a tutoring marketplace several times a day. When it finds a new qualified lead, or a known lead changes, it sends one email:

- Subject, exactly: `Daybook lead`
- Body: one fenced JSON block and nothing else:

```json
{"leads":[
  {"id":"bark_ava_gr12_physics","n":"Ava","d":"Gr 12 Physics","w":"Remote, Tue/Thu evenings","s":"Bark","x":"Qualified. 4 credits to unlock.","date":"2026-11-06"}
]}
```

| Field | Meaning |
|---|---|
| `id` | Stable id (`bark_` + first name + subject tag). Status taps in the app are keyed by it, so it never changes. |
| `n` | First name only |
| `d` | Grade and subject |
| `w` | Where and when (city or remote, times) |
| `s` | Source, e.g. `"Bark"` |
| `x` | One line on status and cost to unlock |
| `date` | Day found, `YYYY-MM-DD` |
| `status` | Optional, `"closed"` when the lead is taken or expired |

`tools/gemini-leads.gs` (Google Apps Script, same Gmail account) checks for these emails every 5 minutes, POSTs the leads to `/api/leads`, and labels the thread `daybook-sent`. The app shows leads that arrived in the last day with a "just in" tag.

Rules the assistant follows: never spend marketplace credits, never contact a lead, and no last names, phone numbers, emails or street addresses.
