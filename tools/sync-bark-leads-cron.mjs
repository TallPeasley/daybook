// Bark Leads Direct API Sync & Gemini Intelligence Pipeline
// Business: Swift Skills / Ascent (Aero suite) | Base: Mississauga, ON
// Implements exact lead qualification, privacy guardrails, Daybook live sync, and Obsidian daily reporting.

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG = join(root, "tools", "refresh.log");
const OBSIDIAN_HANDOFF = "C:\\Users\\mkhai\\Obsidian\\Career-Ops\\Handoff";

function log(msg) {
  const line = `${new Date().toISOString()}  [bark-cron] ${msg}\n`;
  console.log(line.trim());
  try { appendFileSync(LOG, line); } catch {}
}

// 1. Load keys & configuration
let geminiKey = process.env.GEMINI_API_KEY;
if (!geminiKey && existsSync(join(root, "tools", ".env.gemini"))) {
  const env = readFileSync(join(root, "tools", ".env.gemini"), "utf8");
  const m = env.match(/GEMINI_API_KEY=(.+)/);
  if (m) geminiKey = m[1].trim();
}

let daybookKey = process.env.DAYBOOK_KEY;
let daybookUrl = process.env.DAYBOOK_URL || "https://aero-daybook.web.app";
const fbEnv = join(root, "firebase", "functions", ".env.aero-daybook");
if (existsSync(fbEnv)) {
  const env = readFileSync(fbEnv, "utf8");
  const k = env.match(/DAYBOOK_KEY=(.+)/);
  if (k) daybookKey = k[1].trim();
  const u = env.match(/DAYBOOK_URL=(.+)/);
  if (u) daybookUrl = u[1].trim();
}

let barkCookie = "";
const barkEnvPath = join(root, "tools", ".env.bark");
if (existsSync(barkEnvPath)) {
  const env = readFileSync(barkEnvPath, "utf8");
  const m = env.match(/BARK_COOKIE=(.+)/);
  if (m) barkCookie = m[1].trim();
}

function extractBarkJwt(cookieStr) {
  if (!cookieStr) return null;
  const m = cookieStr.match(/__bark_session=([^;]+)/);
  if (!m) return null;
  const raw = decodeURIComponent(m[1]);
  let str = raw;
  try {
    const jsonStr = Buffer.from(raw, "base64").toString("utf8");
    if (jsonStr.startsWith("{")) str = jsonStr;
  } catch {}
  try {
    const parsed = JSON.parse(str);
    return parsed.token || null;
  } catch {
    return null;
  }
}

async function fetchLiveBarkLeads() {
  if (!barkCookie) {
    log("Warning: tools/.env.bark is missing or BARK_COOKIE is not set");
    return [];
  }
  const token = extractBarkJwt(barkCookie);
  const headers = {
    cookie: barkCookie,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
    accept: "application/json, text/plain, */*",
    origin: "https://www.bark.com",
    referer: "https://www.bark.com/"
  };
  if (token) headers["authorization"] = `Bearer ${token}`;

  try {
    const resp = await fetch("https://api.bark.com/seller/barks/?show_filter_counts=1", { headers });
    if (!resp.ok) {
      log(`Bark API error: HTTP ${resp.status} ${resp.statusText}`);
      return [];
    }
    const json = await resp.json();
    return json.data || json.results || [];
  } catch (err) {
    log(`Bark API fetch exception: ${err.message}`);
    return [];
  }
}

async function runBarkGeminiSync() {
  log("Starting Bark sync & Gemini intelligence pipeline...");

  if (!geminiKey) {
    log("Error: GEMINI_API_KEY is missing in tools/.env.gemini");
    return;
  }
  if (!daybookKey) {
    log("Error: DAYBOOK_KEY is missing");
    return;
  }

  // Step 2: Live Bark Fetch
  const rawLeads = await fetchLiveBarkLeads();
  log(`Fetched ${rawLeads.length} raw leads from Bark.`);
  if (!rawLeads.length) {
    log("No leads returned from Bark; check session freshness in tools/.env.bark.");
    return;
  }

  // Compact representation for Gemini qualification
  const leadsForGemini = rawLeads.map((l) => {
    const qa = (l.custom_fields || []).map((q) => `${q.question}: ${q.answer}`).join(" | ");
    const isFree = l.is_free || l.credits_required === 0;
    return {
      project_id: l.project_id,
      name: (l.buyer_share_name || "Client").split(" ")[0], // First name only
      title: l.project_title || "Tutoring",
      details: l.project_detail || "",
      city: l.city_string || "",
      credits: l.credits_required,
      is_free: isFree,
      be_first: !!l.be_first,
      budget: l.estimate_lower && l.estimate_upper ? `$${l.estimate_lower}-$${l.estimate_upper}/${l.estimate_type || "hr"}` : "",
      created: l.created ? new Date(l.created * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      qa
    };
  });

  // Step 3: Gemini Free API (Prompt strictly adhering to Swift Skills / Ascent criteria)
  const systemPrompt = `You are the lead qualification intelligence engine for Swift Skills / Ascent (Aero suite), based in Mississauga, Ontario, Canada.

Analyze these ${leadsForGemini.length} incoming Bark leads:
${JSON.stringify(leadsForGemini, null, 2)}

Strictly apply these qualification rules:

1. SUBJECT QUALIFICATION:
- QUALIFIED:
  * Strictly K-12 Math (Elementary Math, Gr 9-10 Foundations, Gr 11 Functions, Gr 12 Advanced Functions, Gr 12 Calculus & Vectors, Data Management).
  * High School Sciences (Physics, Chemistry, Biology).
  * Standardized Test Prep (e.g. Diploma exams).
- BORDERLINE (STILL INCLUDE):
  * K-12 Math/Science bundled with non-STEM (e.g. English, reading, writing).
  * First-year / intro post-secondary STEM (e.g. First-Year Calculus, Intro Statistics).
- DISQUALIFIED (DROP COMPLETELY):
  * Non-STEM only (English, French, Spanish, History, Geography, vocal/music, aviation).
  * Upper-year specialized university courses (e.g. 3rd-year Spectroscopy).

2. LOCATION & DELIVERY RULES (REMOTE ONLY):
- WE ARE ONLY ACCEPTING REMOTE / ONLINE CLIENTS. No in-person tutoring is offered.
- QUALIFIED: ANY Canadian location qualifies ONLY IF the client accepts or prefers online / remote / video call tutoring (e.g. "Would you consider online or remote tutoring?: Yes").
- DISQUALIFIED (DROP COMPLETELY): ANY lead that requests in-person only OR answers "No" to "Would you consider online or remote tutoring?" MUST BE DISQUALIFIED, regardless of city (even in Mississauga, Oakville, Brampton, Vaughan, or Toronto).

3. PRIVACY & SAFETY GUARDRAILS:
- NEVER include last names, phone numbers, email addresses, or street addresses.
- First name ONLY.
- For location, use city/neighbourhood and 3-character postal prefix only (e.g. "Mississauga (L5M)").

4. FIELD FORMATTING SPEC (Exact Daybook format):
- "id": Stable lowercase string with underscores: "bark_" + first_name.toLowerCase() + "_" + short_subject_tag (e.g. "bark_rita_gr11_u_bio", "bark_ha_gr12_adv_func", "bark_alina_uni_stats").
- "n": First name only.
- "d": Clean grade & subject title (e.g. "Gr 12 Advanced Functions", "University Statistics", "Gr 10 Math & Science").
- "w": City/Region, delivery format, and times (e.g. "Mississauga (L5M), remote, late afternoon", "Pickering (L1V), remote preferred").
- "s": "Bark"
- "x": Note qualification + credits + budget. Must start with "Qualified." or "Borderline: [reason]". (e.g. "Qualified. 3 credits to unlock. Budget: $35.00-$50.00/hour." or "Borderline: Intro post-secondary STEM. 5 credits to unlock.")
- "date": YYYY-MM-DD

OUTPUT SPECIFICATION:
Return ONLY a valid JSON object matching:
{
  "leads": [
    {
      "id": "bark_...",
      "n": "...",
      "d": "...",
      "w": "...",
      "s": "Bark",
      "x": "...",
      "date": "YYYY-MM-DD"
    }
  ]
}`;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`;
    const resp = await fetch(geminiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      })
    });

    if (!resp.ok) {
      log(`Gemini API error: HTTP ${resp.status}`);
      return;
    }

    const json = await resp.json();
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const result = JSON.parse(rawText);
    const qualifiedLeads = result.leads || [];

    log(`Gemini Assessment complete: ${qualifiedLeads.length} qualified/borderline leads identified.`);

    // Step 4: Live Push to Firebase Daybook API
    if (qualifiedLeads.length > 0) {
      const postRes = await fetch(`${daybookUrl}/api/leads`, {
        method: "POST",
        headers: {
          "x-daybook-key": daybookKey,
          "content-type": "application/json"
        },
        body: JSON.stringify({ leads: qualifiedLeads })
      });

      if (postRes.ok) {
        const postData = await postRes.json();
        log(`Success: pushed ${postData.saved?.length || qualifiedLeads.length} leads to Daybook. Total live in app: ${postData.total}`);
      } else {
        log(`Error posting leads to Daybook: HTTP ${postRes.status}`);
      }
    }

    // Update Obsidian Handoff/Bark-Leads-Today.md
    if (existsSync(OBSIDIAN_HANDOFF)) {
      writeObsidianTable(qualifiedLeads);
    }
  } catch (err) {
    log(`Execution error during pipeline: ${err.message}`);
  }
}

function writeObsidianTable(leads) {
  const handoffPath = join(OBSIDIAN_HANDOFF, "Bark-Leads-Today.md");

  let tableMd = `| First Name | Grade & Subject | Location | Status & Credits | Bark Link |\n|---|---|---|---|---|\n`;
  for (const l of leads) {
    const link = `https://www.bark.com/sellers/dashboard/`;
    tableMd += `| ${l.n} | ${l.d} | ${l.w} | ${l.x} | [View lead](${link}) |\n`;
  }
  try {
    writeFileSync(handoffPath, tableMd, "utf8");
    log(`Updated Obsidian Handoff: ${handoffPath}`);
  } catch (e) {
    log(`Warning: could not write Bark-Leads-Today.md: ${e.message}`);
  }
}

runBarkGeminiSync();
