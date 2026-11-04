import { fetchArbeitnow } from './arbeitnow.js';
import { fetchAdzuna } from './adzuna.js';
import { fetchGreenhouse } from './greenhouse.js';
import { fetchLever } from './lever.js';
import { fetchLinkedinEmails } from './linkedinEmail.js';
import { fetchLinkedinSearch } from './linkedinSearch.js';
import { fetchAshby, fetchSmartRecruiters } from './companyBoards.js';
import { fetchLandingJobs, fetchHackerNews } from './relocationBoards.js';
import { fetchStaffAm, fetchHh } from './armenia.js';
import { fetchRemotive, fetchRemoteOk, fetchHimalayas, fetchJobicy, fetchWorkingNomads, fetchWeWorkRemotely } from './remoteBoards.js';

const SOURCES = {
  arbeitnow: (c, cfg) => fetchArbeitnow(c),
  adzuna: (c, cfg) => fetchAdzuna(c, cfg.searchTerms),
  greenhouse: (c) => fetchGreenhouse(c),
  lever: (c) => fetchLever(c),
  ashby: (c) => fetchAshby(c),
  smartrecruiters: (c, cfg) => fetchSmartRecruiters(c, cfg),
  landingjobs: (c) => fetchLandingJobs(c),
  hackernews: (c) => fetchHackerNews(c),
  himalayas: (c, cfg) => fetchHimalayas(c, cfg.searchTerms),
  remotive: (c) => fetchRemotive(c),
  remoteok: () => fetchRemoteOk(),
  jobicy: (c) => fetchJobicy(c),
  workingnomads: () => fetchWorkingNomads(),
  weworkremotely: (c) => fetchWeWorkRemotely(c),
  staffam: (c, cfg) => fetchStaffAm(c, cfg),
  hh: (c, cfg) => fetchHh(c, cfg),
  linkedinSearch: (c, cfg) => fetchLinkedinSearch(c, cfg),
  linkedinEmail: (c) => fetchLinkedinEmails(c),
};

// Runs every enabled source; one failing source never stops the others.
export async function collectAll(config, log = console.log) {
  const all = [], report = {};
  for (const [name, fn] of Object.entries(SOURCES)) {
    const c = config.sources?.[name];
    if (!c?.enabled) continue;
    try {
      const res = await fn(c, config);
      const jobs = Array.isArray(res) ? res : res.jobs || [];
      report[name] = { found: jobs.length, skipped: res.skipped, errors: res.errors || [] };
      all.push(...jobs);
      log(`  ${name}: ${res.skipped ? 'skipped — ' + res.skipped : jobs.length + ' postings'}${res.errors?.length ? ` (${res.errors.length} errors)` : ''}`);
    } catch (e) {
      report[name] = { found: 0, errors: [e.message] };
      log(`  ${name}: FAILED — ${e.message}`);
    }
  }
  return { jobs: all, report };
}
