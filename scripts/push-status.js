// Copies your saved / applied statuses, notes and cover letters (data/status.json, which never
// goes to GitHub) from this PC to the dashboard on your server. Safe to run more than once:
// for each job the most recently changed copy wins.
//
//   npm run push-status -- https://your-domain.com
//
// Reads DASHBOARD_PASSWORD from .env.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
const password = process.env.DASHBOARD_PASSWORD;
if (!target) { console.log('Usage: npm run push-status -- https://your-domain.com'); process.exit(1); }
if (!password) { console.log('Add DASHBOARD_PASSWORD=<the same password as on the server> to .env first.'); process.exit(1); }

const file = path.join(root, 'data', 'status.json');
if (!fs.existsSync(file)) { console.log('No data/status.json on this PC — nothing to copy.'); process.exit(0); }
const body = fs.readFileSync(file, 'utf8');

const res = await fetch(new URL('/api/import-status', target), {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from('me:' + password).toString('base64') },
  body,
});
const out = await res.json().catch(() => ({}));
if (!res.ok) { console.log(`Failed (${res.status}): ${out.error || res.statusText}`); process.exit(1); }
console.log(`Copied ${out.imported} job status(es); the server now has ${out.total}.`);
