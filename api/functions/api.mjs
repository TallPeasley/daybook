// Daybook API: TickTick sync for the Daybook page, and summary data for the Scriptable widget.
// Every route needs the Daybook key (header x-daybook-key), except the TickTick OAuth callback,
// which is checked against a one-time state value instead.
import { getStore } from "@netlify/blobs";
import summary from "./widget-data.json" with { type: "json" };

// The Daybook page's address (for CORS and the redirect after TickTick sign-in). Set in the API site's environment.
const MAIN = process.env.DAYBOOK_SITE_URL || "http://localhost:8888";
const TZ = process.env.DAYBOOK_TZ || "America/Toronto";
const TT = "https://api.ticktick.com/open/v1";
const SCOPE = "tasks:read tasks:write";

const cors = {
  "access-control-allow-origin": MAIN,
  "access-control-allow-headers": "content-type, x-daybook-key",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  vary: "origin",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...cors } });

function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const store = () => getStore("daybook");
const redirectUri = (url) => new URL("/api/tt/callback", url).toString();

async function token() {
  const t = await store().get("tt", { type: "json" });
  if (!t || !t.access_token) return null;
  if (t.expires_at && Date.now() > t.expires_at) return null;
  return t.access_token;
}

async function tt(path, tok, opts = {}) {
  const r = await fetch(TT + path, {
    ...opts,
    headers: { authorization: "Bearer " + tok, "content-type": "application/json", ...(opts.headers || {}) },
  });
  if (r.status === 401) throw Object.assign(new Error("TickTick sign-in expired"), { code: 401 });
  if (!r.ok) throw new Error("TickTick " + r.status + " on " + path);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// The open API's "inbox" alias returns nothing; the real id is "inbox<userId>". TickTick has no endpoint for it,
// so learn it once by adding a throwaway task (which reports its projectId) and deleting it straight away.
async function inboxId(tok) {
  const saved = await store().get("tt_inbox", { type: "json" });
  if (saved && saved.token === tok.slice(-12) && saved.id) return saved.id;
  const t = await tt("/task", tok, { method: "POST", body: JSON.stringify({ title: "Daybook setup check (deletes itself)" }) });
  await tt("/project/" + encodeURIComponent(t.projectId) + "/task/" + encodeURIComponent(t.id), tok, { method: "DELETE" }).catch(() => {});
  await store().setJSON("tt_inbox", { id: t.projectId, token: tok.slice(-12) });
  return t.projectId;
}

// Open tasks from the inbox and every list, soonest due first.
async function openTasks(tok) {
  const projects = (await tt("/project", tok)) || [];
  const inbox = await inboxId(tok).catch(() => "inbox");
  const lists = [{ id: inbox, name: "Inbox" }, ...projects.filter((p) => !p.closed).map((p) => ({ id: p.id, name: p.name }))];
  const results = await Promise.all(
    lists.map((l) =>
      tt("/project/" + encodeURIComponent(l.id) + "/data", tok)
        .then((d) => ((d && d.tasks) || []).map((t) => ({ ...t, _list: l.name })))
        .catch((e) => {
          if (e.code === 401) throw e;
          return [];
        })
    )
  );
  const seen = new Set();
  return results
    .flat()
    .filter((t) => t.status === 0 && !seen.has(t.id) && seen.add(t.id))
    .map((t) => ({ id: t.id, projectId: t.projectId, title: t.title, list: t._list, due: t.dueDate || null, allDay: !!t.isAllDay, priority: t.priority || 0 }))
    .sort((a, b) => (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity) || b.priority - a.priority);
}

// "Today" in the owner's time zone, so the widget's due-today count matches their day.
function localDay(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // OAuth callback from TickTick: checked by the state value saved at login.
  if (path === "/tt/callback") {
    const saved = await store().get("tt_state", { type: "json" });
    const state = url.searchParams.get("state");
    if (!saved || !sameKey(state || "", saved.state) || Date.now() > saved.exp) return new Response("Sign-in link expired. Start again from Daybook.", { status: 400 });
    await store().delete("tt_state");
    const code = url.searchParams.get("code");
    if (!code) return new Response("TickTick did not send a code.", { status: 400 });
    const body = new URLSearchParams({ code, grant_type: "authorization_code", scope: SCOPE, redirect_uri: redirectUri(req.url) });
    const r = await fetch("https://ticktick.com/oauth/token", {
      method: "POST",
      headers: {
        authorization: "Basic " + btoa(process.env.TT_CLIENT_ID + ":" + process.env.TT_CLIENT_SECRET),
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!r.ok) return new Response("TickTick refused the sign-in (" + r.status + ").", { status: 502 });
    const t = await r.json();
    await store().setJSON("tt", { access_token: t.access_token, expires_at: t.expires_in ? Date.now() + t.expires_in * 1000 : null, connected_at: new Date().toISOString() });
    return Response.redirect(MAIN + "/#today", 302);
  }

  const key = req.headers.get("x-daybook-key") || "";
  if (!sameKey(key, process.env.DAYBOOK_KEY || "")) return json({ error: "unauthorized" }, 401);

  try {
    if (path === "/tt/login") {
      if (!process.env.TT_CLIENT_ID || !process.env.TT_CLIENT_SECRET) return new Response("TickTick app keys are not set on the Daybook API yet.", { status: 503 });
      const state = crypto.randomUUID();
      await store().setJSON("tt_state", { state, exp: Date.now() + 10 * 60 * 1000 });
      const q = new URLSearchParams({ scope: SCOPE, client_id: process.env.TT_CLIENT_ID, state, redirect_uri: redirectUri(req.url), response_type: "code" });
      return json({ url: "https://ticktick.com/oauth/authorize?" + q });
    }

    if (path === "/tasks" && req.method === "GET") {
      const tok = await token();
      if (!tok) return json({ connected: false, tasks: [] });
      return json({ connected: true, tasks: await openTasks(tok) });
    }

    if (path === "/tasks" && req.method === "POST") {
      const tok = await token();
      if (!tok) return json({ error: "not connected" }, 409);
      const b = await req.json();
      const title = String(b.title || "").trim().slice(0, 500);
      if (!title) return json({ error: "empty title" }, 400);
      const t = await tt("/task", tok, { method: "POST", body: JSON.stringify({ title }) });
      return json({ ok: true, task: { id: t.id, projectId: t.projectId, title: t.title, list: "Inbox", due: t.dueDate || null } });
    }

    if (path === "/tasks/complete" && req.method === "POST") {
      const tok = await token();
      if (!tok) return json({ error: "not connected" }, 409);
      const b = await req.json();
      if (!b.id || !b.projectId) return json({ error: "missing id" }, 400);
      await tt("/project/" + encodeURIComponent(b.projectId) + "/task/" + encodeURIComponent(b.id) + "/complete", tok, { method: "POST" });
      return json({ ok: true });
    }

    // Checklist taps from the Daybook page: {jobs:{id:"applied"|"skip"}, msgs:{id:1}, done:{key:1}, ts}.
    // Last write wins on the whole object; the page sends its full state after each tap.
    // tools/refresh-daybook.mjs reads it each morning and writes Handoff/Daybook-Ticks.md in the vault.
    if (path === "/state" && req.method === "GET") {
      return json((await store().get("state", { type: "json" })) || { jobs: {}, msgs: {}, done: {}, ts: 0 });
    }
    if (path === "/state" && req.method === "POST") {
      const b = await req.json();
      const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
      const s = { jobs: obj(b.jobs), msgs: obj(b.msgs), done: obj(b.done), ts: Number(b.ts) || Date.now() };
      if (JSON.stringify(s).length > 200000) return json({ error: "too large" }, 413);
      const cur = await store().get("state", { type: "json" });
      if (cur && cur.ts > s.ts) return json({ ok: false, newer: cur }, 409);
      await store().setJSON("state", s);
      return json({ ok: true, ts: s.ts });
    }

    // Daily data: tools/refresh-daybook.mjs POSTs {DATA, P, widget} here each morning instead of redeploying
    // (redeploys cost Netlify credits). The page fetches it on open and uses it when it is newer than its built-in copy.
    if (path === "/data" && req.method === "GET") {
      return json((await store().get("data", { type: "json" })) || {});
    }
    if (path === "/data" && req.method === "POST") {
      const txt = await req.text();
      if (txt.length > 2_000_000) return json({ error: "too large" }, 413);
      const b = JSON.parse(txt);
      if (!b.DATA || !Array.isArray(b.DATA.jobs) || !b.P || !b.P.builtAt) return json({ error: "bad shape" }, 400);
      await store().setJSON("data", { DATA: b.DATA, P: b.P, widget: b.widget || null, at: new Date().toISOString() });
      return json({ ok: true, jobs: b.DATA.jobs.length });
    }

    // Live tutoring leads (Gemini/Bark), pushed as they arrive by the Gmail Apps Script (tools/gemini-leads.gs).
    // POST {leads:[{id?, n, d, w, s, x, date, status?}]} upserts by id; GET returns them newest first.
    if (path === "/leads" && req.method === "GET") {
      return json({ leads: (await store().get("leads", { type: "json" })) || [] });
    }
    if (path === "/leads" && req.method === "POST") {
      const b = await req.json();
      const s = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
      const slug = (v) => s(v, 80).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const incoming = (Array.isArray(b.leads) ? b.leads : [b]).filter((l) => l && l.n).slice(0, 50).map((l) => ({
        id: slug(l.id) || "bark_" + slug(l.n + "_" + (l.d || "")).slice(0, 40),
        n: s(l.n, 60), d: s(l.d, 120), w: s(l.w, 200), s: s(l.s || "Bark", 30), x: s(l.x, 400),
        date: s(l.date, 10) || new Date().toISOString().slice(0, 10),
        status: ["closed", "gone"].includes(s(l.status, 10)) ? "closed" : "",
        at: new Date().toISOString(),
      }));
      if (!incoming.length) return json({ error: "no leads (each needs at least n)" }, 400);
      const cur = (await store().get("leads", { type: "json" })) || [];
      const byId = new Map(cur.map((l) => [l.id, l]));
      for (const l of incoming) byId.set(l.id, { ...(byId.get(l.id) || {}), ...l });
      const all = [...byId.values()].sort((a, c) => (c.date + c.at).localeCompare(a.date + a.at)).slice(0, 200);
      await store().setJSON("leads", all);
      return json({ ok: true, saved: incoming.map((l) => l.id), total: all.length });
    }

    if (path === "/widget") {
      // Shape read by the Scriptable widget: {updated, counts:{todo,roles,leads}, tasks:[{title,due}]}, plus extras.
      const stored = await store().get("data", { type: "json" });
      const base = stored && stored.widget ? stored.widget : summary;
      const leadsKpi = base.kpis.find((k) => /lead/i.test(k.label));
      const out = { ...base, updated: new Date().toISOString(), counts: { todo: null, roles: base.roles, leads: leadsKpi ? Number(leadsKpi.n) : null }, tasks: [], tt: null };
      const tok = await token();
      if (tok) {
        const tasks = await openTasks(tok);
        out.counts.todo = tasks.length;
        out.tasks = tasks.slice(0, 6).map((t) => ({ title: t.title, due: t.due }));
        const today = localDay(new Date());
        const dayOf = (t) => (t.due ? localDay(new Date(t.due)) : null);
        const dueToday = tasks.filter((t) => dayOf(t) === today);
        const overdue = tasks.filter((t) => dayOf(t) && dayOf(t) < today);
        out.tt = { today: dueToday.length, overdue: overdue.length, top: [...overdue, ...dueToday].slice(0, 3).map((t) => t.title) };
      }
      return json(out);
    }

    if (path === "/status") {
      const t = await store().get("tt", { type: "json" });
      if (url.searchParams.get("lists") && t && t.access_token) {
        const projects = (await tt("/project", t.access_token)) || [];
        const ids = ["inbox", ...projects.map((p) => p.id)];
        const lists = await Promise.all(ids.map((id) => tt("/project/" + encodeURIComponent(id) + "/data", t.access_token).then((d) => ({ id: id === "inbox" ? "inbox" : "list", open: ((d && d.tasks) || []).filter((x) => x.status === 0).length, total: ((d && d.tasks) || []).length })).catch((e) => ({ id: id === "inbox" ? "inbox" : "list", error: String(e.message) }))));
        return json({ projects: projects.length, lists });
      }
      return json({ ok: true, ticktick: !!(t && t.access_token), connected_at: t ? t.connected_at : null, app_keys_set: !!(process.env.TT_CLIENT_ID && process.env.TT_CLIENT_SECRET) });
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    if (e.code === 401) {
      await store().delete("tt");
      return json({ connected: false, error: "TickTick sign-in expired. Connect again." }, 200);
    }
    return json({ error: String(e.message || e) }, 502);
  }
};

export const config = { path: "/api/*" };
