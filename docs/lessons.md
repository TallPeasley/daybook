# What building Daybook taught me

Notes on the problems I hit and how I solved them, for anyone building something similar.

## 1. Keep data changes from triggering deploys
The first version rebuilt the page with fresh data and redeployed it every 30 minutes. That used up the hosting plan's 300 monthly build credits in two days, and deploys started failing with 403 errors. The fix was to treat code and data as separate things:
- The refresh script hashes the page code (with the data cut out) and the API code separately from the data.
- Data changes are POSTed to `/api/data`, a key-value store (Netlify Blobs). No deploy happens.
- A deploy only happens when the code hash changes, and a failed deploy is retried on the next run.
- The page still ships with a built-in copy of the data, so it renders instantly, then swaps in newer data from the API.

## 2. Let AI agents talk through strict, dated contracts
Three assistants feed the app: a Claude scheduled task (morning brief), a Gemini task (tutoring leads) and the refresh script. Each writes a small, fixed shape (`daybook-today.json`, or a JSON block in an email with an exact subject line). The refresh script checks each file's `date` and every field's type, and keeps yesterday's text when the check fails. A bad run then can't put stale or broken text in front of me. See [daily-brief-format.md](daily-brief-format.md) and [gemini-lead-format.md](gemini-lead-format.md).

## 3. Close the loop back to the source
Ticks on the phone (Applied, Skip, Sent, Done) are more than UI state. They go to `/api/state`, the next refresh writes them into the notes vault as a Markdown table, and the next morning's brief reads that table and treats it as my decision. The AI stops suggesting things I've already done.

## 4. Simple sync rules beat clever ones
Tap state is one small object with a timestamp. The client sends the whole object; the server keeps the newest one and returns 409 with its copy if the client is behind. Two phones can't silently overwrite each other, and there is no merge logic to debug.

## 5. Stable IDs keep user state alive across rebuilds
Saved ticks are keyed by job id. When I changed how jobs were read, I kept the old id format (the folder name cut to 60 characters) so ticks already saved on the phone still matched. Tutoring leads use ids like `bark_<name>_<subject>` that never change once used.

## 6. Work around API gaps instead of fighting them
TickTick's open API has an `inbox` alias that returns no tasks, and no endpoint for the real inbox id. The API learns it once by creating a throwaway task (which reports its list id), deleting it straight away, and caching the id.

## 7. Match security to each client
- The page site sits behind a hosting login, because its config carries the API key.
- The iOS widget (Scriptable) can't sign in through a browser, so the API site is public but checks a key header on every route with a constant-time comparison.
- The TickTick OAuth callback can't carry the key, so it's checked against a one-time `state` value that expires after 10 minutes.
- Secrets live in environment variables, never in the repo.

## 8. Keep a human in the loop for anything outward-facing
The app drafts LinkedIn messages but never sends them. It lists paid tutoring leads but never spends credits to unlock them. Everything that reaches another person goes through a tap of mine.

## 9. Small platform gotchas
- On Windows, calling `process.exit()` right after `fetch` in Node can trip a libuv assertion. Letting the script end on its own avoids it.
- iPhone home-screen web apps only show a custom icon when the site is on its own domain.
- Scheduled tasks run in the signed-in user's profile, so CLI logins and environment variables must exist there.
