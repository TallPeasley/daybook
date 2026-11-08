// Daybook home-screen widget for Scriptable (iOS). Small or medium size.
// Reads GET /api/widget: {date, counts:{todo, roles, leads}, messages, next:[{what, when}], tt:{today, overdue, top:[...]}}
// Setup: paste into Scriptable, fill in the two values below, add a Scriptable widget and pick this script.
const API = "https://<your-api-site>.netlify.app/api";
const KEY = Keychain.contains("daybook-key") ? Keychain.get("daybook-key") : "<your DAYBOOK_KEY>"; // or store it once with Keychain.set
const APP = "https://<your-daybook-site>.netlify.app/#today";

const C = { bg: new Color("#1f3a37"), ink: new Color("#e6efed"), muted: new Color("#93a5a1"), hot: new Color("#f0a44a") };

async function load() {
  const r = new Request(API + "/widget");
  r.headers = { "x-daybook-key": KEY };
  r.timeoutInterval = 10;
  return await r.loadJSON();
}

function stat(stack, n, label, hot) {
  const s = stack.addStack();
  s.layoutVertically();
  const t = s.addText(n == null ? "–" : String(n));
  t.font = Font.boldRoundedSystemFont(22);
  t.textColor = hot ? C.hot : C.ink;
  const l = s.addText(label);
  l.font = Font.systemFont(10);
  l.textColor = C.muted;
}

const w = new ListWidget();
w.backgroundColor = C.bg;
w.url = APP;
w.setPadding(12, 12, 12, 12);
try {
  const d = await load();
  const head = w.addText(("Daybook · " + (d.date || "")).toUpperCase());
  head.font = Font.mediumMonospacedSystemFont(9);
  head.textColor = C.muted;
  w.addSpacer(6);
  const row1 = w.addStack(); stat(row1, d.counts.roles, "roles"); row1.addSpacer(); stat(row1, d.counts.todo, "to-dos", d.tt && d.tt.overdue > 0);
  w.addSpacer(4);
  const row2 = w.addStack(); stat(row2, d.messages, "messages", d.messages > 0); row2.addSpacer(); stat(row2, d.counts.leads, "leads");
  w.addSpacer();
  const line = d.tt && d.tt.top && d.tt.top.length ? (d.tt.overdue + d.tt.today) + " due: " + d.tt.top[0] : d.next && d.next[0] ? "Next: " + d.next[0].what + ", " + d.next[0].when : "";
  const foot = w.addText(line);
  foot.font = Font.systemFont(10);
  foot.textColor = C.ink;
  foot.lineLimit = 2;
} catch (e) {
  const t = w.addText("Daybook: can't reach the API");
  t.textColor = C.ink;
  t.font = Font.systemFont(12);
}
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
Script.setWidget(w);
if (config.runsInApp) await w.presentSmall();
Script.complete();
