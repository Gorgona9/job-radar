import { fetchJson, stripHtml, sleep } from '../util.js';

// Free remote-job boards with public JSON/RSS feeds (no keys). Each one says who it is open to
// (worldwide, specific countries, EU only…). That ends up in `location`, so the rules in filter.js
// can drop "EU only" / "US only" postings before they reach the AI.

const UA = { 'user-agent': 'Mozilla/5.0 (job-radar personal job search)' };

// https://remotive.com/api/remote-jobs (please link back to Remotive — every job links to its page)
export async function fetchRemotive(cfg) {
  const jobs = [];
  for (const category of cfg.categories || ['software-dev']) {
    const body = await fetchJson(`https://remotive.com/api/remote-jobs?category=${encodeURIComponent(category)}`);
    for (const j of body.jobs || []) {
      jobs.push({
        source: 'remotive', sourceId: String(j.id),
        title: j.title, company: j.company_name,
        location: `Remote — ${j.candidate_required_location || 'unspecified'}`,
        url: j.url, description: stripHtml(j.description),
        postedAt: j.publication_date ? new Date(j.publication_date + 'Z').toISOString() : null,
        remote: true, tags: [...(j.tags || []), j.job_type].filter(Boolean),
        salaryText: j.salary || null,
      });
    }
    await sleep(800);
  }
  return jobs;
}

// https://remoteok.com/api — first element is the legal notice.
export async function fetchRemoteOk() {
  const list = await fetchJson('https://remoteok.com/api', { headers: UA });
  return list.filter((j) => j && j.id && j.position).map((j) => ({
    source: 'remoteok', sourceId: String(j.id),
    title: stripHtml(j.position), company: j.company || '',
    location: `Remote — ${j.location || 'unspecified'}`,
    url: j.url, description: stripHtml(j.description),
    postedAt: j.date || null, remote: true, tags: j.tags || [],
    salary: j.salary_min ? { min: j.salary_min, max: j.salary_max || j.salary_min, currency: 'USD' } : null,
  }));
}

// https://himalayas.app/jobs/api — locationRestrictions is an explicit country list (empty = worldwide).
export async function fetchHimalayas(cfg, searchTerms) {
  const seen = new Map();
  for (const q of cfg.queries || searchTerms) {
    const body = await fetchJson(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&limit=${cfg.perQuery ?? 50}&sort=recent`);
    for (const j of body.jobs || []) {
      if (seen.has(j.guid)) continue;
      const allowed = j.locationRestrictions || [];
      seen.set(j.guid, {
        source: 'himalayas', sourceId: j.guid.split('/').slice(-3).join('/'),
        title: j.title, company: j.companyName,
        location: `Remote — ${allowed.length ? (allowed.length > 6 ? `${allowed.length} countries` : allowed.join(', ')) : 'Worldwide'}`,
        allowedCountries: allowed,
        url: j.applicationLink || j.guid, description: stripHtml(j.description || j.excerpt),
        postedAt: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : null,
        remote: true, tags: [...(j.categories || []), ...(j.seniority || [])],
        salary: j.minSalary && j.salaryPeriod === 'annual' ? { min: j.minSalary, max: j.maxSalary || j.minSalary, currency: j.currency } : null,
      });
    }
    await sleep(700);
  }
  return [...seen.values()];
}

// https://jobicy.com/api/v2/remote-jobs (credit Jobicy — every job links back)
export async function fetchJobicy(cfg) {
  const body = await fetchJson(`https://jobicy.com/api/v2/remote-jobs?count=${cfg.count ?? 100}&industry=${cfg.industry || 'dev'}`);
  return (body.jobs || []).map((j) => ({
    source: 'jobicy', sourceId: String(j.id),
    title: stripHtml(j.jobTitle), company: j.companyName,
    location: `Remote — ${j.jobGeo || 'unspecified'}`,
    url: j.url, description: stripHtml(j.jobDescription || j.jobExcerpt),
    postedAt: j.pubDate || null, remote: true, tags: [...(j.jobIndustry || []), ...(j.jobType || []), j.jobLevel].filter(Boolean),
    salary: j.annualSalaryMin ? { min: Number(j.annualSalaryMin), max: Number(j.annualSalaryMax || j.annualSalaryMin), currency: j.salaryCurrency } : null,
  }));
}

// https://www.workingnomads.com/api/exposed_jobs/
export async function fetchWorkingNomads() {
  const list = await fetchJson('https://www.workingnomads.com/api/exposed_jobs/');
  return list.filter((j) => /development|engineering|software/i.test(j.category_name || '')).map((j) => ({
    source: 'workingnomads', sourceId: j.url.match(/\/(\d+)\/?$/)?.[1] || j.url,
    title: j.title, company: j.company_name,
    location: `Remote — ${j.location || 'unspecified'}`,
    url: j.url, description: stripHtml(j.description),
    postedAt: j.pub_date || null, remote: true, tags: String(j.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
  }));
}

// We Work Remotely RSS feeds. Title is "Company: Job title", <region> says who can apply.
export async function fetchWeWorkRemotely(cfg) {
  const jobs = [];
  for (const cat of cfg.categories || ['remote-full-stack-programming-jobs', 'remote-back-end-programming-jobs', 'remote-front-end-programming-jobs']) {
    const res = await fetch(`https://weworkremotely.com/categories/${cat}.rss`, { headers: UA });
    if (!res.ok) throw new Error(`${res.status} for WWR ${cat}`);
    const xml = await res.text();
    for (const item of xml.split('<item>').slice(1)) {
      const tag = (t) => (item.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() || '';
      const full = stripHtml(tag('title'));
      const i = full.indexOf(':');
      const link = tag('link') || tag('guid');
      jobs.push({
        source: 'weworkremotely', sourceId: link.split('/').pop(),
        company: i > 0 ? full.slice(0, i).trim() : '', title: i > 0 ? full.slice(i + 1).trim() : full,
        location: `Remote — ${stripHtml(tag('region')) || 'unspecified'}${tag('country') ? ' (' + stripHtml(tag('country')) + ')' : ''}`,
        url: link, description: stripHtml(stripHtml(tag('description'))),
        postedAt: tag('pubDate') ? new Date(tag('pubDate')).toISOString() : null,
        remote: true, tags: [stripHtml(tag('category')), stripHtml(tag('type'))].filter(Boolean),
      });
    }
    await sleep(600);
  }
  return jobs;
}
