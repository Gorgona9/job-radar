import { pathToFileURL } from 'node:url';
import { collectAll } from './sources/index.js';
import { prefilter } from './filter.js';
import { scoreJobs } from './scorer.js';
import { notifyNewMatches, telegramConfigured } from './telegram.js';
import { loadJobs, saveJobs } from './store.js';
import { loadConfig, loadProfile, dedupKey } from './util.js';

let running = null;

export function isRunning() { return Boolean(running); }

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

  const errors = Object.entries(report).flatMap(([k, r]) => (r.errors || []).map((e) => (e.startsWith(k) ? e : `${k}: ${e}`)));
  let telegramResult = 'disabled for this run';
  if (telegram) {
    const send = newMatches.filter((j) => config.telegram.sendVerdicts.includes(j.verdict.relocation) && j.verdict.score >= config.telegram.minScore);
    try { telegramResult = await notifyNewMatches(send, { filteredCount: filtered, errors }); }
    catch (e) { telegramResult = 'failed: ' + e.message; }
  }

  const run = {
    at: now, seconds: Math.round((Date.now() - started) / 1000),
    collected: raw.length, new: fresh.length, matches: newMatches.length, filtered,
    pending: Object.values(db.jobs).filter((j) => j.state === 'pending').length,
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
