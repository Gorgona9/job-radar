import { pathToFileURL } from 'node:url';
import { collectAll } from './sources/index.js';
import { prefilter } from './filter.js';
import { scoreJobs } from './scorer.js';
import { notifyNewMatches, telegramConfigured } from './telegram.js';
import { loadJobs, saveJobs } from './store.js';
import { loadConfig, loadProfile, dedupKey } from './util.js';

let running = null;

export function isRunning() { return Boolean(running); }

// Sources that list ALL of a company's open jobs on every request (not just the newest search results).
const COMPLETE_LISTS = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters']);

// Marks postings that are gone. Company career boards return every open job each time, so a job missing
// from a board that loaded without errors has been taken down. Search-style sources only return the latest
// results, so for those we can only say "not seen anywhere for N days". `now` is this run's lastSeenAt stamp.
export function markAvailability(db, report, now, config) {
  const staleDays = config.staleAfterDays ?? 14;
  let closed = 0, reopened = 0;
  for (const j of Object.values(db.jobs)) {
    if (j.lastSeenAt === now) {
      if (j.closedAt) { delete j.closedAt; delete j.closedReason; reopened++; }
      continue;
    }
    if (j.closedAt) continue;
    const r = report[j.source];
    if (COMPLETE_LISTS.has(j.source) && r?.found > 0 && !r.errors?.length) {
      j.closedAt = now; j.closedReason = 'Removed from the company’s job board'; closed++;
    } else if (Date.parse(now) - Date.parse(j.lastSeenAt || j.foundAt) > staleDays * 864e5) {
      j.closedAt = now; j.closedReason = `Not seen in any source for ${staleDays}+ days`; closed++;
    }
  }
  return { closed, reopened };
}

export function runFetch(opts = {}) {
  if (!running) running = doRun(opts).finally(() => { running = null; });
  return running;
}

async function doRun({ telegram = true, log = console.log } = {}) {
  const config = loadConfig();
  const profile = loadProfile();
  const db = loadJobs();
  const now = new Date().toISOString();
  const started = Date.now();
  log(`[${now}] Collecting jobs…`);

  config._knownIds = new Set(Object.keys(db.jobs)); // LinkedIn search skips detail pages it already has
  const { jobs: raw, report } = await collectAll(config, log);

  const byKey = new Map(Object.values(db.jobs).map((j) => [j.dedupKey, j]));
  const fresh = [];
  for (const r of raw) {
    const id = `${r.source}:${r.sourceId}`;
    if (db.jobs[id]) { db.jobs[id].lastSeenAt = now; continue; }
    const key = dedupKey(r);
    const twin = byKey.get(key);
    if (twin) { // same job seen on another board: remember the extra link, don't re-notify
      twin.alsoOn = [...new Set([...(twin.alsoOn || []), `${r.source}|${r.url}`])];
      twin.lastSeenAt = now;
      continue;
    }
    const job = { ...r, id, dedupKey: key, foundAt: now, lastSeenAt: now, description: (r.description || '').slice(0, 9000) };
    db.jobs[id] = job;
    byKey.set(key, job);
    fresh.push(job);
  }

  const { closed, reopened } = markAvailability(db, report, now, config);
  if (closed || reopened) log(`  availability: ${closed} postings closed${reopened ? `, ${reopened} back online` : ''}`);

  // Cheap rules first; only the survivors go to the AI.
  const toScore = [];
  let filtered = 0;
  for (const job of fresh) {
    const reason = prefilter(job, config);
    if (reason) { job.state = 'filtered'; job.filterReason = reason; filtered++; }
    else { job.state = 'pending'; }
  }
  // Pending jobs (new + leftovers from earlier runs that hit the per-run cap or failed)
  for (const j of Object.values(db.jobs)) if (j.state === 'pending') toScore.push(j);
  toScore.sort((a, b) => (b.foundAt || '').localeCompare(a.foundAt || ''));
  const batch = toScore.slice(0, config.scoring.maxJobsPerRun);
  log(`  ${fresh.length} new postings, ${filtered} filtered by rules, scoring ${batch.length}${toScore.length > batch.length ? ` (${toScore.length - batch.length} left for next run)` : ''}`);

  const verdicts = await scoreJobs(batch, profile, config, log);
  const newMatches = [];
  for (const job of batch) {
    const v = verdicts.get(job.id);
    if (!v || v.error) continue; // stays pending, retried next run
    job.verdict = v;
    job.scoredAt = now;
    if (v.relocation === 'no') { job.state = 'filtered'; job.filterReason = `No relocation: ${v.relocation_evidence || ''}`.trim(); filtered++; }
    else if (v.german === 'required') { job.state = 'filtered'; job.filterReason = 'Fluent German required'; filtered++; }
    else { job.state = 'match'; newMatches.push(job); }
  }

  // Scoring problems are reported like a source, so they show in the run log and in Telegram.
  const stillPending = Object.values(db.jobs).filter((j) => j.state === 'pending').length;
  const scoringErrors = [];
  if (verdicts.fatal) scoringErrors.push(`AI scoring stopped: ${verdicts.fatal}. ${stillPending} jobs are waiting and will be scored on the next run.`);
  if (verdicts.failed) scoringErrors.push(`${verdicts.failed} job(s) could not be scored (first error: ${verdicts.firstError})`);
  report.scoring = { found: batch.length - batch.filter((j) => j.state === 'pending').length, errors: scoringErrors };

  const errorsOf = (rep) => Object.entries(rep || {}).flatMap(([k, r]) => (r.errors || []).map((e) => (e.startsWith(k) ? e : `${k}: ${e}`)));
  const errors = errorsOf(report);
  const previousErrors = errorsOf(db.runs.at(-1)?.sources);
  let telegramResult = 'disabled for this run';
  if (telegram) {
    const send = newMatches.filter((j) => config.telegram.sendVerdicts.includes(j.verdict.relocation) && j.verdict.score >= config.telegram.minScore);
    try { telegramResult = await notifyNewMatches(send, { filteredCount: filtered, errors, previousErrors }); }
    catch (e) { telegramResult = 'failed: ' + e.message; }
  }

  const run = {
    at: now, seconds: Math.round((Date.now() - started) / 1000),
    collected: raw.length, new: fresh.length, matches: newMatches.length, filtered, closed,
    pending: stillPending,
    sources: report, telegram: telegramResult,
  };
  db.runs.push(run);
  saveJobs(db);
  log(`  done: ${newMatches.length} new matches. Telegram: ${telegramResult}`);
  if (!telegramConfigured() && telegram) log('  (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to get notifications)');
  return run;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFetch({ telegram: !process.argv.includes('--no-telegram') })
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
