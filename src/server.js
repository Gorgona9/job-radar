import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { ROOT, loadConfig, loadProfile } from './util.js';
import { loadJobs, loadStatus, saveStatus, updateJobStatus } from './store.js';
import { runFetch, isRunning } from './fetch.js';
import { callClaude, hasApiKey } from './scorer.js';

const config = loadConfig();
const PORT = Number(process.env.PORT) || config.port || 4310;
const MODE = config.mode === 'github' ? 'github' : 'local';
let lastSync = null;

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

function gitPull() {
  return new Promise((resolve) => {
    execFile('git', ['pull', '--ff-only', '--quiet'], { cwd: ROOT }, (err, stdout, stderr) => {
      lastSync = { at: new Date().toISOString(), ok: !err, message: err ? (stderr || err.message).trim() : 'Up to date' };
      resolve(lastSync);
    });
  });
}

const COVER_SYSTEM = `You write cover letters for the candidate described below. They must read like a real person wrote them:
- natural, warm, direct voice; no template phrases ("I am writing to express my interest", "I believe I would be a great fit", "dynamic", "passionate")
- 220–320 words, short paragraphs, no headings or bullet points
- be specific: connect 2–3 concrete things from her experience to concrete things in this posting
- ALWAYS mention her GitHub link and personal projects (loadit.app, EEGOO, Bragi) where they are relevant, as evidence of full-stack ownership
- say plainly that she is based in Armenia and ready to relocate to Germany; mention she qualifies for the EU Blue Card as an IT specialist with 8+ years — only if the posting is in Germany
- be honest: never claim skills she doesn't have; if a must-have is a gap, you may frame it as something she is actively closing, only if natural
- end with a simple, human closing and her name
Output only the letter text.

CANDIDATE PROFILE:
`;

async function coverLetter(id) {
  const job = loadJobs().jobs[id];
  if (!job) throw new Error('Job not found');
  if (!hasApiKey()) throw new Error('Add ANTHROPIC_API_KEY to .env to draft cover letters');
  const user = `Write the cover letter for this job.\n\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\nLink: ${job.url}\n\n${job.description || '(Only title and company are known — keep the letter general about the role type and ask for details where needed.)'}`;
  const text = await callClaude({ model: config.scoring.coverLetterModel || config.scoring.model, system: COVER_SYSTEM + loadProfile(), user, maxTokens: 1200 });
  updateJobStatus(id, { coverLetter: text.trim() });
  return text.trim();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, fs.readFileSync(path.join(ROOT, 'public', 'index.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/jobs') {
      const db = loadJobs();
      const st = loadStatus();
      const jobs = Object.values(db.jobs).map((j) => ({ ...j, my: st.jobs[j.id] || null }));
      return send(res, 200, {
        jobs, runs: db.runs.slice(-60), lastSeenAt: st.lastSeenAt,
        mode: MODE, running: isRunning(), lastSync, aiEnabled: hasApiKey(),
        scheduleEveryHours: config.scheduleEveryHours,
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/status') {
      const { id, ...patch } = await readBody(req);
      const allowed = {};
      for (const k of ['status', 'note']) if (k in patch) allowed[k] = patch[k];
      if (allowed.status === 'applied') allowed.appliedAt = new Date().toISOString();
      return send(res, 200, updateJobStatus(id, allowed));
    }
    if (req.method === 'POST' && url.pathname === '/api/seen') {
      const st = loadStatus();
      st.lastSeenAt = new Date().toISOString();
      saveStatus(st);
      return send(res, 200, { lastSeenAt: st.lastSeenAt });
    }
    if (req.method === 'POST' && url.pathname === '/api/fetch') {
      if (MODE === 'github') return send(res, 200, await gitPull());
      const run = await runFetch({ telegram: true });
      return send(res, 200, run);
    }
    if (req.method === 'POST' && url.pathname === '/api/cover-letter') {
      const { id } = await readBody(req);
      return send(res, 200, { text: await coverLetter(id) });
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Job radar dashboard: http://localhost:${PORT}  (mode: ${MODE})`);
});

// Scheduling: in local mode the dashboard process also runs the radar every N hours,
// and catches up right away if the last run is older than that (e.g. laptop was off).
const hours = config.scheduleEveryHours || 6;
async function tick() {
  if (MODE === 'github') { await gitPull(); return; }
  const last = loadJobs().runs.at(-1);
  const due = !last || Date.now() - new Date(last.at).getTime() > hours * 3600e3 - 60e3;
  if (due && !isRunning()) runFetch({ telegram: true }).catch((e) => console.error('Run failed:', e.message));
}
if (!process.argv.includes('--no-schedule')) {
  setTimeout(tick, 3000);
  setInterval(tick, 15 * 60e3);
}
