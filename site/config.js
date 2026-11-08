// Demo configuration. No API: TickTick, sync and live leads are simulated inside the page.
// In the real app, tools/make-widget-data.mjs writes this file instead, e.g.
//   window.DAYBOOK_API = { url: "https://<your-api-site>.netlify.app/api", key: "<your DAYBOOK_KEY>" };
// (the real site sits behind a login, so the key never reaches the public web).
window.DAYBOOK_API = null;
window.DAYBOOK_DEMO = true;
