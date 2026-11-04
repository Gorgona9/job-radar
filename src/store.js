import path from 'node:path';
import { DATA_DIR, readJson, writeJsonAtomic } from './util.js';

// jobs.json   — everything the radar has ever found (written only by the fetcher; committed in GitHub mode)
// status.json — your actions: saved / applied / notes / cover letters (written only by the dashboard; stays on your machine)
export const JOBS = path.join(DATA_DIR, 'jobs.json');
export const STATUS = path.join(DATA_DIR, 'status.json');

export function loadJobs() {
  return readJson(JOBS, { jobs: {}, runs: [] });
}
export function saveJobs(db) {
  db.runs = db.runs.slice(-300);
  writeJsonAtomic(JOBS, db);
}
export function loadStatus() {
  return readJson(STATUS, { jobs: {}, lastSeenAt: null });
}
export function saveStatus(st) {
  writeJsonAtomic(STATUS, st);
}
export function updateJobStatus(id, patch) {
  const st = loadStatus();
  st.jobs[id] = { ...(st.jobs[id] || {}), ...patch, updatedAt: new Date().toISOString() };
  saveStatus(st);
  return st.jobs[id];
}
