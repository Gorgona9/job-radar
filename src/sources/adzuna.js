import { fetchJson, stripHtml, sleep } from '../util.js';

// Free key from https://developer.adzuna.com. Descriptions are shortened (~500 chars),
// so the AI verdict is often "unclear" — open the link for the full text.
export async function fetchAdzuna(cfg, searchTerms) {
  const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) return { skipped: 'no ADZUNA_APP_ID / ADZUNA_APP_KEY in .env' };
  const jobs = [];
  for (const term of searchTerms) {
    const qs = new URLSearchParams({
      app_id: id, app_key: key, what: term,
      results_per_page: String(cfg.resultsPerTerm ?? 50),
      max_days_old: String(cfg.maxDaysOld ?? 7),
      sort_by: 'date',
    });
    const body = await fetchJson(`https://api.adzuna.com/v1/api/jobs/de/search/1?${qs}`);
    for (const j of body.results || []) {
      const predicted = String(j.salary_is_predicted) === '1';
      jobs.push({
        source: 'adzuna',
        sourceId: String(j.id),
        title: stripHtml(j.title),
        company: j.company?.display_name || '',
        location: j.location?.display_name || '',
        url: j.redirect_url,
        description: stripHtml(j.description),
        postedAt: j.created || null,
        remote: null,
        tags: [],
        salary: !predicted && j.salary_min ? { min: Math.round(j.salary_min), max: Math.round(j.salary_max || j.salary_min), currency: 'EUR' } : null,
        shortDescription: true,
      });
    }
    await sleep(500);
  }
  return jobs;
}
