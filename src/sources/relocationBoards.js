import { fetchJson, stripHtml, sleep } from '../util.js';

// Boards where relocation / visa sponsorship is common or explicitly flagged.

// https://landing.jobs/api/v1/jobs — European tech jobs; has an explicit `relocation_paid` flag.
export async function fetchLandingJobs(cfg) {
  const jobs = [];
  const pages = cfg.maxPages ?? 4;
  for (let p = 0; p < pages; p++) {
    const list = await fetchJson(`https://landing.jobs/api/v1/jobs?limit=50&offset=${p * 50}`);
    if (!list.length) break;
    for (const j of list) {
      const companySlug = j.url?.match(/\/at\/([^/]+)\//)?.[1] || '';
      const loc = (j.locations || []).map((l) => [l.city, l.country_code].filter(Boolean).join(', ')).join(' / ');
      jobs.push({
        source: 'landingjobs', sourceId: String(j.id),
        title: j.title, company: companySlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        location: j.remote ? `Remote — ${loc || 'unspecified'}` : loc,
        url: j.url,
        description: [
          j.relocation_paid ? 'Relocation paid: yes (flag set by the employer on Landing.jobs).' : '',
          stripHtml(j.role_description), 'Requirements:\n' + stripHtml(j.main_requirements),
          'Nice to have:\n' + stripHtml(j.nice_to_have), 'Perks:\n' + stripHtml(j.perks),
        ].filter(Boolean).join('\n\n'),
        postedAt: j.published_at || null, remote: Boolean(j.remote),
        tags: [...(j.tags || []), j.relocation_paid ? 'relocation paid' : null].filter(Boolean),
        salary: j.gross_salary_low ? { min: j.gross_salary_low, max: j.gross_salary_high || j.gross_salary_low, currency: j.currency_code } : null,
      });
    }
    await sleep(500);
  }
  return jobs;
}

// Hacker News "Ask HN: Who is hiring?" — monthly thread; lots of companies mark VISA / RELOCATION.
// We only keep comments that mention visa or relocation, so this source is small but high-signal.
export async function fetchHackerNews(cfg) {
  const stories = await fetchJson('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10');
  const threads = (stories.hits || []).filter((h) => /who is hiring/i.test(h.title)).slice(0, cfg.threads ?? 1);
  const jobs = [];
  for (const t of threads) {
    const item = await fetchJson(`https://hn.algolia.com/api/v1/items/${t.objectID}`);
    for (const c of item.children || []) {
      if (!c.text) continue;
      const text = stripHtml(c.text);
      if (!/\bvisa|relocat|sponsor/i.test(text)) continue;
      const first = text.split('\n')[0];
      const parts = first.split('|').map((s) => s.trim()).filter(Boolean);
      const role = parts.find((p) => /engineer|developer|full[\s-]?stack|backend|frontend|software/i.test(p)) || parts[1] || 'Software Engineer';
      const location = parts.find((p) => /remote|onsite|on-site|hybrid|,|\b[A-Z]{2}\b/.test(p) && p !== role) || '';
      jobs.push({
        source: 'hackernews', sourceId: String(c.id),
        title: role.slice(0, 140), company: (parts[0] || '').slice(0, 80),
        location: location.slice(0, 120),
        url: `https://news.ycombinator.com/item?id=${c.id}`,
        description: text, postedAt: c.created_at || null,
        remote: /remote/i.test(location) || null, tags: ['HN who is hiring'],
      });
    }
  }
  return jobs;
}
