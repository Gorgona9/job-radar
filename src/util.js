import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ON_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT);

// Where jobs.json / status.json live. On Railway this must be a volume (Railway sets
// RAILWAY_VOLUME_MOUNT_PATH when one is attached) — the container's own disk is wiped on every deploy.
export const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(ROOT, 'data');

// A fresh, empty volume starts from the history committed in the repo, so nothing found so far is lost.
const REPO_JOBS = path.join(ROOT, 'data', 'jobs.json');
if (DATA_DIR !== path.join(ROOT, 'data') && !fs.existsSync(path.join(DATA_DIR, 'jobs.json')) && fs.existsSync(REPO_JOBS)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.copyFileSync(REPO_JOBS, path.join(DATA_DIR, 'jobs.json'));
  console.log(`Seeded ${DATA_DIR}/jobs.json from the repo copy`);
}

// config.json is shared by your PC and the server; environment variables override the few
// settings that differ: RADAR_MODE (local | github) and DASHBOARD_URL (link in Telegram messages).
// On Railway the server runs the radar itself, so mode defaults to "local" there.
export function loadConfig() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  const mode = process.env.RADAR_MODE || (ON_RAILWAY ? 'local' : null);
  if (mode) config.mode = mode;
  if (process.env.DASHBOARD_URL) config.telegram.dashboardUrl = process.env.DASHBOARD_URL;
  return config;
}

export function loadProfile() {
  return fs.readFileSync(path.join(ROOT, 'profile.md'), 'utf8');
}

export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  fs.renameSync(tmp, file);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function stripHtml(html = '') {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalize(s = '') {
  return String(s).toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(gmbh|ag|se|inc|ltd|llc|kg|m\/w\/d|w\/m\/d|m\/f\/d|f\/m\/d|all genders?)\b/g, ' ')
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim();
}

export function dedupKey(job) {
  return normalize(job.company) + '|' + normalize(job.title);
}

const GERMAN_WORDS = new Set('und der die das mit für wir sie ist zu von auf eine ein einen den dem des nicht bei als oder auch ihre ihr unser unsere unseren du dich dein deine wird werden sind hast bist bietest bieten suchen'.split(' '));
export function germanRatio(text = '') {
  const words = String(text).toLowerCase().match(/[a-zäöüß]+/g) || [];
  if (words.length < 40) return 0;
  let hits = 0;
  for (const w of words) if (GERMAN_WORDS.has(w)) hits++;
  return hits / words.length;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function escHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'user-agent': 'job-radar/1.0 (personal job search)', accept: 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url.split('?')[0]}`);
  return res.json();
}
