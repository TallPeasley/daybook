# Daybook: Tutoring Redesign & Firebase Deployment Handoff

This document details the code modifications, new features, and deployment procedures for the **Daybook** project, ready to hand off to the `aero` workspace task.

---

## 1. Project & Repository Status

| Resource | Value / URL |
|---|---|
| **GitHub Repository** | [`TallPeasley/daybook`](https://github.com/TallPeasley/daybook) |
| **Active Branch** | `main` |
| **Latest Commits** | `59886c8` (Tutoring & Flyer Tracker redesign), `1768d72` (Firebase Hosting setup) |
| **GitHub Pages (Live)** | [https://tallpeasley.github.io/daybook/](https://tallpeasley.github.io/daybook/) |
| **Firebase Project** | `aero-daybook` ([Firebase Console](https://console.firebase.google.com/project/aero-daybook)) |
| **Firebase Live URL** | `https://aero-daybook.web.app` (and `https://aero-daybook.firebaseapp.com`) |

---

## 2. What Was Built & Fixed

### A. Eliminated Broken Multi-Column Side-Scroll
- **Problem**: Naive multi-column / kanban layouts caused horizontal scrolling on mobile/desktop screens, leaving middle stages ("Contacted") empty while right stages were stretched awkwardly long.
- **Solution**: Replaced side-scrolling columns with a mobile-first, fluid vertical stack:
  - **Stage switcher tiles**: Tap any stage (`New`, `Contacted`, `Students`, `Closed`) to filter immediately.
  - **All Stages view**: Renders clean, structured groups with count badges and an auto-collapsed archive for closed leads (`<details class="lowfold">`).
  - **Zero horizontal overflow**: Fully responsive down to 320px screens.

### B. New Feature: Flyer Tracker
Tutoring side-businesses rely heavily on physical paper flyers (bulletin boards in libraries, high schools, community centers, cafes). Tutoring now has a dedicated **Flyers Tracker** tab alongside the pipeline.

- **Dual-Mode Sub-Navigation**: Quick toggle at the top of the `#tutoring` tab:
  - `[ 📋 Pipeline (11) ]`
  - `[ 📑 Flyers Tracker (5) ]`
- **Hero Metrics Strip**:
  - `Active Spots` (5 default locations)
  - `Need Restock` (Spots with $\le 2$ tabs remaining)
  - `Tabs Pulled` (Total prospect tear-offs taken)
  - `Flyer Leads` (Inquiries originating from flyers)
- **Low-Stock Alert Banner**: Prominently flags locations that have run out or are running low, with a 1-tap **Restock All Low** action.
- **Visual Tear-Off Tab Strip**: Custom CSS representation of the physical tear-off strip (`.tear-strip` with `.tear-tab` elements):
  - Available tabs are highlighted in teal/amber.
  - Pulled tabs are shown with dashed borders and `✕`.
  - Shows `X / Total available`.
- **Tactile Quick Actions**:
  - `🔄 Restock (Reset to Total)`: 1-tap restock resetting tabs and updating date.
  - `− 1 Tab Pulled`: Decrements count when prospect pulls a tab.
  - `+ 1 Call`: Tracks incoming inquiry calls per location.
  - `+ Log Flyer Spot`: Drawer form to add new physical locations (Spot Name, Board Area, Initial Tab Count, Notes).
- **Connected Lead Attribution**: Bi-directional links between leads and flyer spots:
  - Grace has badge `📑 Flyer · Waterloo Central Library` (tapping navigates to the Flyer Tracker and focuses on that spot).
  - The Waterloo Central Library card shows `✦ Generated lead: Grace (Gr 11 Functions)` (tapping switches to Pipeline and scrolls to Grace).
- **Persistent Storage**: Flyer data is stored in `M.flyers` inside `localStorage` under `daybook_mine`.

---

## 3. Files Modified & Added

```
daybook/
├── .firebaserc                              # [NEW] Default project: aero-daybook
├── firebase.json                            # [NEW] Hosting config: public "site", SPA rewrites
├── .github/
│   └── workflows/
│       ├── pages.yml                        # GitHub Pages auto-deploy (existing)
│       └── firebase-hosting-merge.yml       # [NEW] GitHub Actions deploy to Firebase Hosting
├── site/
│   └── index.html                           # [MODIFIED] Tutoring & Flyers markup, styles, & JS
└── README.md                                # [MODIFIED] Updated tutoring description
```

---

## 4. Deployment Procedures for the "Aero" Workspace

### Method 1: Direct Deploy via Firebase CLI (Recommended for local machine)

From any terminal where you have git and node:

```powershell
# 1. Clone the updated repository:
git clone https://github.com/TallPeasley/daybook.git daybook-app
cd daybook-app

# 2. Deploy directly to Firebase Hosting:
firebase deploy --only hosting
```

> [!TIP]
> If the `firebase` CLI is not installed globally, use `npx`:
> ```powershell
> npx -y firebase-tools deploy --only hosting
> ```

---

### Method 2: Automated Deploy via GitHub Actions

The repository includes [`.github/workflows/firebase-hosting-merge.yml`](.github/workflows/firebase-hosting-merge.yml). To enable automatic deployment on every git push:

1. In the Firebase Console, go to **[Project Settings > Service Accounts](https://console.firebase.google.com/project/aero-daybook/settings/serviceaccounts/adminsdk)**.
2. Click **Generate new private key** (downloads a `.json` file).
3. In GitHub, go to **[TallPeasley/daybook > Settings > Secrets and variables > Actions](https://github.com/TallPeasley/daybook/settings/secrets/actions)**.
4. Click **New repository secret**:
   - **Name**: `FIREBASE_SERVICE_ACCOUNT_AERO_DAYBOOK`
   - **Secret**: Paste the full contents of the downloaded `.json` key file.
5. Every subsequent push to `main` will automatically build and deploy to Firebase Hosting.

---

### Method 3: Copying Files into Another Workspace / Directory

If you need to transfer the code into an existing `aero` folder on your machine:

1. Copy the following items from this repository:
   - `site/` (entire folder: `index.html`, `config.js`, `manifest.webmanifest`, icons)
   - `firebase.json`
   - `.firebaserc`
2. Place them into your target folder:
   ```
   aero-task/
   ├── firebase.json
   ├── .firebaserc
   └── site/
       ├── index.html
       └── ...
   ```
3. Run `firebase deploy --only hosting` inside `aero-task/`.

---

## 5. Local Testing

To preview the app locally before deploying:

```bash
# Python
python3 -m http.server -d site 8080

# Or Node / npx
npx -y serve site
```
Open `http://localhost:8080` in your browser (preferably in mobile device emulation mode).
