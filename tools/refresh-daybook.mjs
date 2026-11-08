// Daily Daybook refresh.  node tools/refresh-daybook.mjs [--deploy] [--force]
//
// Rebuilds the data embedded in site/index.html from the notes vault (DAYBOOK_VAULT):
//   jobs      <- Tools/brief/q.json + jobsmd.json   (written by daily_pack.py in the Email Brief run)
//   messages  <- Handoff/Pending-LinkedIn-Messages.md  (READY and HOLD tables)
//   Today / Updates text <- Tools/brief/daybook-today.json  (written by the Email Brief run; only used when dated today)
// With --deploy it then runs make-widget-data.mjs and deploys the site and the API to Netlify,
// but only when the rebuilt data differs from what was last deployed (or with --force).
// Every run appends one line to tools/refresh.log.
import { readFileSync, writeFileSync, existsSync, statSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Settings come from the environment (see .env.example). Nothing personal is hard-coded.
const VAULT = process.env.DAYBOOK_VAULT;
if (!VAULT) throw new Error("Set DAYBOOK_VAULT to the notes vault folder (see .env.example)");
const API_URL = (process.env.DAYBOOK_API_URL || "http://localhost:8888/api").replace(/\/$/, "");
const SITE_ID = process.env.NETLIFY_SITE_ID || "";
const API_SITE_ID = process.env.NETLIFY_API_SITE_ID || "";
const apiKey = () => process.env.DAYBOOK_KEY || readFileSync(join(root, "api", ".daybook-key"), "utf8").trim();
const BRIEF = join(VAULT, "Tools", "brief");
const args = new Set(process.argv.slice(2));
const LOG = join(root, "tools", "refresh.log");
const STATE = join(root, "tools", ".last-deploy.json");
const log = (msg) => {
  const line = new Date().toISOString() + "  " + msg;
  console.log(line);
  try { appendFileSync(LOG, line + "\n"); } catch {}
};

const pad = (n) => String(n).padStart(2, "0");
const isoLocal = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = isoLocal(new Date());
const nice = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Companies the owner never wants to see (a standing rule in the vault). Matched as lowercase substrings.
const EXCL = (process.env.DAYBOOK_EXCLUDE || "insurance").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const excluded = (co) => EXCL.some((e) => String(co).toLowerCase().includes(e));
// Role slugs to keep out (closed, expired or excluded by hand), same as the brief generator's list.
const OMIT = new Set((process.env.DAYBOOK_OMIT || "").split(",").map((s) => s.trim()).filter(Boolean));
const TERM = { W27: "Winter 2027", S27: "Summer 2027" };

// ---------- current page ----------
const indexPath = join(root, "site", "index.html");
let html = readFileSync(indexPath, "utf8");
const span = (start, endMarker) => {
  const a = html.indexOf(start);
  const b = html.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error("Could not find " + start + " in index.html");
  return [a, b];
};
const evalJs = (src) => Function("return (" + src + ")")();
let [da, db] = span("const DATA=", ";\nconst P=");
const oldDATA = evalJs(html.slice(da + "const DATA=".length, db));
let [pa, pb] = span("const P=", ";\nconst $=");
const oldP = evalJs(html.slice(pa + "const P=".length, pb));

// ---------- jobs ----------
const qPath = join(BRIEF, "q.json");
const Q = JSON.parse(readFileSync(qPath, "utf8"));
const openLinks = new Set(JSON.parse(readFileSync(join(BRIEF, "jobsmd.json"), "utf8")).map((r) => r[1]));
const jobsDate = isoLocal(statSync(qPath).mtime);
const OPEN = /^(not started|in-progress|needs-login|needs-answer)/;
const jobs = Q.filter((x) => {
  const s = String(x.status || "").toLowerCase();
  if (OMIT.has(x.slug) || excluded(x.company)) return false;
  if (s.startsWith("applied") || s.includes("likely submitted")) return false;
  return OPEN.test(s) && openLinks.has(x.link);
})
  .sort((a, b) => b.score - a.score || a.company.localeCompare(b.company))
  .map((x) => ({
    id: String(x.folder).slice(0, 60), // the first build cut ids at 60 chars; keep that so Applied/Skip ticks saved on the phone still match
    co: x.company,
    t: String(x.role).replace(/\\&/g, "&"),
    term: TERM[x.term] || x.term,
    s: x.score,
    u: x.link,
    a: x.found || "",
    ...(String(x.status).toLowerCase().startsWith("needs-answer") ? { flag: "needs answers" } : {}),
    ...(String(x.status).toLowerCase().startsWith("needs-login") ? { flag: "needs sign-in" } : {}),
  }));

// ---------- messages ----------
const pmPath = join(VAULT, "Handoff", "Pending-LinkedIn-Messages.md");
const pm = readFileSync(pmPath, "utf8");
const section = (title) => {
  const i = pm.indexOf("## " + title);
  if (i < 0) return "";
  const j = pm.indexOf("\n## ", i + 3);
  return pm.slice(i, j < 0 ? undefined : j);
};
const tableRows = (text) => {
  const rows = text.split("\n").filter((l) => l.trim().startsWith("|")).map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.toLowerCase());
  return rows.slice(2).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] || ""])));
};
const slugId = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const msgs = tableRows(section("READY TO SEND"))
  .filter((r) => r.person && r.message && !excluded(r.company))
  .map((r) => ({
    id: slugId(r.person),
    p: r.person,
    co: r.company,
    role: r.role,
    u: /^https?:\/\//.test(r.linkedin) ? r.linkedin : "",
    m: r.message,
  }));
const hold = tableRows(section("HOLD"))
  .filter((r) => r.person)
  .map((r) => r.person + (r.company && !/^unknown/i.test(r.company) ? " (" + r.company + ")" : "") + (/do not use template|follow up (yourself|myself)/i.test(r["why held"] || "") ? ", you follow up yourself" : ""));

// ---------- Today / Updates text from the Email Brief ----------
const P = { ...oldP };
let textNote;
const tPath = join(BRIEF, "daybook-today.json");
if (existsSync(tPath)) {
  try {
    const T = JSON.parse(readFileSync(tPath, "utf8"));
    const arr = (k, w) => Array.isArray(T[k]) && T[k].every((r) => (w ? Array.isArray(r) && r.length >= w : typeof r === "string"));
    const ok = T.date === today && typeof T.dateLine === "string" && arr("kpis", 2) && arr("glance") && arr("attn", 2) && arr("spot", 4) && arr("dead", 2) && arr("over", 2) && arr("upd", 2);
    if (ok) {
      // Optional: almost[] = [company, title fragment or "", next action]; leads[] = {n, d, w, s, x, date, id?}
      if (Array.isArray(T.almost)) P.almost = T.almost.filter((r) => Array.isArray(r) && r[0] && r[2]).map((r) => [String(r[0]), String(r[1] || ""), String(r[2])]);
      if (Array.isArray(T.leads)) {
        const fresh = T.leads
          .filter((l) => l && l.n)
          .map((l) => ({ id: l.id || "bark_" + slugId(l.n + "_" + (l.d || "")).slice(0, 40), n: String(l.n), d: String(l.d || ""), w: String(l.w || ""), s: String(l.s || "Bark"), x: String(l.x || ""), date: String(l.date || today) }));
        const ids = new Set(fresh.map((l) => l.id));
        P.leads = fresh.concat((oldP.leads || []).filter((l) => !ids.has(l.id))).slice(0, 80);
      }
      P.date = T.dateLine;
      for (const k of ["glance", "attn", "dead", "over", "upd"]) P[k] = T[k];
      P.kpis = T.kpis.map((k) => [String(k[0]), String(k[1]), k[2] || ""]);
      P.spot = T.spot.map((s) => [s[0], s[1], String(s[2]), s[3], s[4] || ""]);
      P.textDate = today;
      textNote = "text from daybook-today.json";
    } else textNote = T.date === today ? "daybook-today.json is malformed, kept previous text" : "daybook-today.json is dated " + T.date + ", kept previous text";
  } catch (e) {
    textNote = "daybook-today.json unreadable (" + e.message + "), kept previous text";
  }
} else textNote = "no daybook-today.json, kept previous text";
P.hold = hold;
P.builtAt = new Date().toISOString();
P.dataDate = jobsDate;
P.textDate = P.textDate || oldP.textDate || "2026-11-03";
P.updated = "Jobs and messages updated " + nice(jobsDate) + (P.textDate === jobsDate ? "" : " · summary from " + nice(P.textDate));

// ---------- write ----------
const DATA = { jobs, msgs };
const pLiteral = "{\n" + Object.entries(P).map(([k, v]) => JSON.stringify(k) + ":" + JSON.stringify(v)).join(",\n") + "\n}";
html = html.slice(0, da) + "const DATA=" + JSON.stringify(DATA) + html.slice(db);
[pa, pb] = span("const P=", ";\nconst $=");
html = html.slice(0, pa) + "const P=" + pLiteral + html.slice(pb);
writeFileSync(indexPath, html);
writeFileSync(join(root, "data-snapshot-latest.json"), JSON.stringify({ date: jobsDate, ...DATA }, null, 1));

// Two hashes: code (page minus its data, plus the API code) decides a Netlify deploy, which costs credits;
// data decides a POST to /api/data, which is free of deploys. The page loads /api/data when it opens.
const sha = (...parts) => { const h = createHash("sha256"); parts.forEach((p) => h.update(p)); return h.digest("hex").slice(0, 16); };
const codeOnly = html.slice(0, da) + "const DATA=0" + html.slice(html.indexOf(";\nconst P=", da), html.indexOf("const P=", da)) + "const P=0" + html.slice(html.indexOf(";\nconst $=", da));
const codeHash = sha(codeOnly, readFileSync(join(root, "api", "functions", "api.mjs"), "utf8"));
const dataHash = sha(JSON.stringify(DATA), JSON.stringify({ ...P, builtAt: "", updated: "" }));
const strip = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const widget = {
  date: String(P.date).split(/\s+·\s+/)[0],
  kpis: (P.kpis || []).map((k) => ({ n: k[0], label: strip(k[1]), tone: k[2] || "" })),
  roles: jobs.length,
  messages: msgs.length,
  next: (P.dead || []).slice(0, 3).map((d) => ({ what: strip(d[0]), when: strip(d[1]) })),
  generated: P.builtAt,
};

// ---------- phone taps -> vault (Handoff/Daybook-Ticks.md), read by the Email Brief ----------
let ticksNote = "";
try {
  const r = await fetch(API_URL + "/state", { headers: { "x-daybook-key": apiKey() } });
  if (!r.ok) throw new Error("API " + r.status);
  const S = await r.json();
  const byId = new Map(Q.map((x) => [String(x.folder).slice(0, 60), x]));
  const msgById = new Map([...oldDATA.msgs, ...msgs].map((m) => [m.id, m]));
  const cell = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
  const jobRows = Object.entries(S.jobs || {}).map(([id, v]) => {
    const x = byId.get(id);
    return `| ${v === "applied" ? "applied" : "not applying"} | ${cell(x ? x.company : "")} | ${cell(x ? String(x.role).replace(/\\&/g, "&") : id)} | ${x ? x.score : ""} | ${cell(x ? x.folder : id)} | ${cell(x ? x.link : "")} |`;
  });
  const msgRows = Object.keys(S.msgs || {}).map((id) => {
    const m = msgById.get(id);
    return `| ${cell(m ? m.p : id)} | ${cell(m ? m.co : "")} | ${cell(m ? m.role : "")} |`;
  });
  const md = [
    "# Daybook ticks (from the phone)",
    "",
    `Written by tools/refresh-daybook.mjs at ${new Date().toISOString()}. Last tap on the phone: ${S.ts ? new Date(S.ts).toISOString() : "none yet"}.`,
    "These are the owner's own taps in the Daybook app. Treat them as their word: \"applied\" means they submitted it themselves, \"not applying\" means they decided to skip it, and a message listed as sent means they sent it on LinkedIn. This file is overwritten on every run; do not edit it.",
    "",
    "## Jobs",
    "",
    "| tap | company | role | score | folder | link |",
    "|---|---|---|---|---|---|",
    ...(jobRows.length ? jobRows : ["| none | | | | | |"]),
    "",
    "## LinkedIn messages marked sent",
    "",
    "| person | company | role |",
    "|---|---|---|",
    ...(msgRows.length ? msgRows : ["| none | | |"]),
    "",
  ].join("\n");
  writeFileSync(join(VAULT, "Handoff", "Daybook-Ticks.md"), md);
  ticksNote = `; ticks: ${jobRows.length} jobs, ${msgRows.length} messages`;
} catch (e) {
  ticksNote = "; ticks NOT exported (" + e.message + ")";
}
const summary = `${jobs.length} jobs (was ${oldDATA.jobs.length}), ${msgs.length} messages (was ${oldDATA.msgs.length}), ${hold.length} on hold; ${textNote}${ticksNote}`;

// No process.exit() after fetch: on Windows it can trip a libuv assertion and report a crash. Let the script end on its own.
let last = {};
try { last = JSON.parse(readFileSync(STATE, "utf8")); } catch {}
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "pipe", encoding: "utf8", shell: true });
const errTail = (e) => String(e.stderr || e.stdout || e.message).match(/"error":\s*"([^"]+)"/)?.[1] || String(e.stderr || e.stdout || e.message).trim().split("\n").slice(-2).join(" | ");
const saveState = () => writeFileSync(STATE, JSON.stringify(last));
if (!args.has("--deploy")) {
  log("built, not published: " + summary);
} else {
  const force = args.has("--force");
  // 1) Code changed: deploy (rare). A failed deploy (e.g. Netlify credits used up) is retried on the next run.
  if (last.code !== codeHash || force) {
    try {
      run("node tools/make-widget-data.mjs");
      if (!SITE_ID || !API_SITE_ID) throw new Error("set NETLIFY_SITE_ID and NETLIFY_API_SITE_ID to deploy");
      run("netlify deploy --no-build --dir api/public --functions api/functions --site " + API_SITE_ID + " --prod");
      run("netlify deploy --no-build --dir site --site " + SITE_ID + " --prod");
      last.code = codeHash; last.deployedAt = new Date().toISOString(); saveState();
      log("code deployed (site + API)");
    } catch (e) {
      log("CODE DEPLOY FAILED, will retry next run: " + errTail(e) + (/Forbidden|credit/i.test(errTail(e)) ? " (Netlify credits used up? they reset monthly on the 14th)" : ""));
      process.exitCode = 1;
    }
  }
  // 2) Data changed: send it to the API, no deploy needed.
  if (last.data !== dataHash || force) {
    try {
      const r = await fetch(API_URL + "/data", {
        method: "POST",
        headers: { "x-daybook-key": apiKey(), "content-type": "application/json" },
        body: JSON.stringify({ DATA, P, widget }),
      });
      if (!r.ok) throw new Error("API " + r.status + (r.status === 404 ? " (the API with /data is not deployed yet)" : ""));
      last.data = dataHash; last.publishedAt = new Date().toISOString(); saveState();
      log("data published to the API: " + summary);
    } catch (e) {
      log("DATA PUBLISH FAILED, will retry next run: " + e.message + " :: " + summary);
      process.exitCode = 1;
    }
  } else log("no data change since " + (last.publishedAt || "?") + ": " + summary);
}
