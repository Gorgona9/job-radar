import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');

export function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
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
