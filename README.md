# Job radar — developer jobs in Germany that hire from abroad

Collects developer postings for Germany, throws out everything that needs an existing EU work permit or fluent German, has Claude read the rest against your profile, sends **every** remaining match to Telegram, and keeps the full history in a local dashboard (http://localhost:4310), so nothing is lost if you don't look for a few days.

## Setup (10 minutes)

Needs Node.js 20.6 or newer.

```bash
npm install
cp .env.example .env
```

1. **Telegram.** In Telegram, open @BotFather, send `/newbot`, and copy the token into `TELEGRAM_BOT_TOKEN`. Open your new bot and press Start. Then run `npm run test:telegram`: it prints your `TELEGRAM_CHAT_ID`. Paste that into `.env` and run the command again to get a test message.
2. **Claude API key** (`ANTHROPIC_API_KEY`, from console.anthropic.com). This is what actually reads postings and judges relocation. Scoring uses a small model, so a run costs cents. Without a key the radar still works with keyword rules, but it's much cruder.
3. **Optional sources:**
   - **Adzuna:** get a free key at developer.adzuna.com and fill `ADZUNA_APP_ID` / `ADZUNA_APP_KEY`.
   - **hh.ru:** its vacancy search only answers registered apps. Register a free app at https://dev.hh.ru, get an application token and put it in `HH_ACCESS_TOKEN`. Until then the source is skipped (staff.am and LinkedIn still cover Armenia).
   - **LinkedIn:** on LinkedIn, create job alerts (e.g. "Java Developer", "Full Stack Developer", location Germany, daily, by email). Put your Gmail address in `IMAP_USER` and a Gmail [app password](https://myaccount.google.com/apppasswords) in `IMAP_PASSWORD`. The radar only reads those alert emails. It never logs in to LinkedIn, so your account is safe.

```bash
npm start
```

Open http://localhost:4310. The first check starts by itself. After that it runs every 6 hours while `npm start` is running. If the laptop was off, it catches up as soon as you start it again (boards keep postings for weeks, so nothing is missed). `npm run fetch` runs one check from the terminal.

## How a job gets through

1. **Rules (free):** it must be a developer title in a German city (or remote and open to Armenia). It's dropped for students, interns, embedded/SAP-type roles, phrases like "no visa sponsorship" or "must already have a work permit", and postings written in German.
2. **Claude reads the posting** and returns:
   - relocation: **yes / likely / unclear / no**, with the exact phrase as evidence
   - German level (none / a plus / required)
   - salary
   - your matching skills and gaps
   - a one-line summary
3. **Score (0–100)** = skill fit × relocation certainty × German penalty. Salaries below the EU Blue Card line (€45,934 for IT in 2026) are flagged. Companies in `knownSponsors` get a boost.
4. **Delivery:** "no" and "German required" go to the *Filtered out* tab with the reason, so you can double-check. Everything else goes to Telegram and *All matches*.

## Dashboard

- **Where:** *Abroad* (relocation and visa, with country pills), *Armenia* (no move needed, so relocation isn't judged) and *Remote* (only jobs open to people in Armenia), or *Everywhere*.
- **Role:** *Backend* shows server-side jobs without frontend work; also *Full stack* and *Frontend*. The AI labels each new job; older ones are labelled from their title and description.

- **New:** matches found since you last pressed *Mark all as seen*. They stay there until you do, so missing a few days is fine.
- **All matches:** grouped by the day they were found. You can filter by relocation verdict, source and minimum score, and search across title, company, city and skills.
- **Job details:** open the posting, save it, set a status (applied, interview, offer, rejected), keep notes, or draft a cover letter. Cover letters are written from `profile.md` in your style and always include your GitHub and projects.
- **Saved / Applied:** your pipeline.
- **Run log:** what each check found, and any source errors.

## Tuning

Everything is in `config.json` and `profile.md`:

- `searchTerms`, `titleExclude`, `germanyLocations`: what to look for and what to skip.
- `sources.greenhouse.boards` / `sources.lever.companies`: **watch specific companies directly**. This is the best way to catch employers you know sponsor. Find the slug in a job link: `boards.greenhouse.io/<slug>/jobs/...` or `jobs.lever.co/<slug>/...`. If a slug is wrong, it shows up as a 404 in the Run log.
- `knownSponsors`: company names that get a boost and are treated as "likely" when a posting says nothing either way. Add a company each time one confirms it sponsors.
- `telegram.sendVerdicts` / `telegram.minScore`: if Telegram gets too noisy, drop `"unclear"` or raise the minimum score. Nothing is lost; the dashboard keeps everything.
- `profile.md`: the AI judges fit and writes cover letters from this. Keep it current, including the gaps list.

## Optional: always on, even with the laptop closed

Set `"mode": "github"` in `config.json` and push the project to a **private** GitHub repo. Add these as repository secrets:

- `ANTHROPIC_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- optionally `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `IMAP_USER`, `IMAP_PASSWORD`

GitHub Actions (`.github/workflows/job-radar.yml`) then runs every 6 hours, sends Telegram messages and commits `data/jobs.json`. Your local `npm start` just pulls that file ("Sync from GitHub"). Your statuses, notes and cover letters stay in `data/status.json` on your machine (it's in `.gitignore`).

## Hosting on Railway (dashboard online, radar runs there)

On Railway one service does everything: it serves the dashboard on your domain and runs the radar every 6 hours itself. Settings come from `railway.json` (start command, health check).

1. **Create the service.** railway.com → New Project → Deploy from GitHub repo → pick this repo.
2. **Attach a volume** (service → right-click / ⌘K → *Attach volume*), mount path `/data`. Without it, statuses and new jobs are wiped on every deploy; the log warns if it's missing. On first start the volume gets a copy of `data/jobs.json` from the repo.
3. **Variables** (service → Variables):
   - `DASHBOARD_PASSWORD` — at least 10 characters. Required: the server won't start publicly without it. The browser asks for it (any username).
   - `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and optionally `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `IMAP_USER`, `IMAP_PASSWORD`
   - `DASHBOARD_URL` — your address, e.g. `https://example.com`, used in Telegram messages
   - Railway sets `PORT`; on Railway the server listens publicly and runs in local mode automatically (override with `HOST` / `RADAR_MODE`).
4. **Domain.** Service → Settings → Networking → *Custom domain* → enter your domain. Railway shows a DNS target (`something.up.railway.app`) and a verification TXT record. In Namecheap → Domain List → Manage → **Advanced DNS**:
   - for the main domain (`example.com`): add an **ALIAS Record**, host `@`, value = Railway's target; remove the default `URL Redirect`/parking records for `@`
   - for `www`: a **CNAME Record**, host `www`, value = the same target (add `www.example.com` in Railway too)
   - add the **TXT Record** Railway asks for
   - wait for Railway to show the domain as verified; it then issues the HTTPS certificate itself.
5. **Move your statuses** (saved/applied/notes/cover letters live only on your PC): add the same `DASHBOARD_PASSWORD` to your local `.env`, then `npm run push-status -- https://example.com`.
6. **Switch off GitHub Actions** so jobs aren't searched and messaged twice: repo → Actions → job-radar → ⋯ → *Disable workflow* (or `gh workflow disable job-radar.yml`).

## Data

- `data/jobs.json`: every job ever found, with its verdict.
- `data/status.json`: your actions.

Both are plain JSON, so you can back them up or open them in anything.
