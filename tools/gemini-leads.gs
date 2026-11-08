/**
 * Daybook live leads relay (Google Apps Script).
 * Runs in the Gmail account that receives Gemini's lead emails.
 * Every 5 minutes it finds new emails with subject "Daybook lead", reads the JSON block in each,
 * sends the leads to the Daybook API (they show in the Tutoring tab the next time the app opens),
 * and labels the thread "daybook-sent" so it is never sent twice.
 *
 * Setup (once):
 * 1. script.google.com > New project, signed in to the Gmail account Gemini sends to. Paste this file.
 * 2. Project Settings > Script properties > add
 *      DAYBOOK_URL = https://<your-api-site>.netlify.app/api/leads
 *      DAYBOOK_KEY = your API key (the DAYBOOK_KEY environment variable on the API site)
 * 3. Run "setup" once and allow Gmail + external-request access. It creates the label and a 5-minute trigger.
 * 4. Test: run "testPost". A lead called "Test Lead" appears in Daybook > Tutoring; set it to Closed afterwards.
 */
const SUBJECT = 'subject:"Daybook lead" newer_than:3d -label:daybook-sent';
const prop = (k) => PropertiesService.getScriptProperties().getProperty(k);

function setup() {
  GmailApp.getUserLabelByName("daybook-sent") || GmailApp.createLabel("daybook-sent");
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === "relay") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("relay").timeBased().everyMinutes(5).create();
}

function relay() {
  const label = GmailApp.getUserLabelByName("daybook-sent") || GmailApp.createLabel("daybook-sent");
  const threads = GmailApp.search(SUBJECT, 0, 20);
  threads.forEach((th) => {
    const leads = [];
    th.getMessages().forEach((m) => leads.push(...parseLeads(m.getPlainBody())));
    if (!leads.length) { label.addToThread(th); return; } // nothing usable; don't retry forever
    if (post(leads)) label.addToThread(th);
  });
}

// Accepts a ```json fenced block, or the first {...}/[...] in the body. Shape: {"leads":[...]}, [...], or one lead object.
function parseLeads(body) {
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : (body.match(/[\[{][\s\S]*[\]}]/) || [""])[0];
  try {
    const j = JSON.parse(raw);
    const list = Array.isArray(j) ? j : Array.isArray(j.leads) ? j.leads : [j];
    return list.filter((l) => l && l.n);
  } catch (e) {
    return [];
  }
}

function post(leads) {
  const r = UrlFetchApp.fetch(prop("DAYBOOK_URL"), {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { "x-daybook-key": prop("DAYBOOK_KEY") }, payload: JSON.stringify({ leads }),
  });
  if (r.getResponseCode() !== 200) console.error("Daybook API " + r.getResponseCode() + ": " + r.getContentText());
  return r.getResponseCode() === 200;
}

function testPost() {
  post([{ id: "test_lead", n: "Test Lead", d: "Gr 10 Math", w: "Test only, set to Closed", s: "Bark", x: "Sent by testPost()", date: new Date().toISOString().slice(0, 10) }]);
}
