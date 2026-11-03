import { fetchJson, stripHtml, sleep } from '../util.js';

// Free public API, no key. Germany-focused board with many English-speaking / visa-sponsoring employers.
// Note: its query filters don't actually narrow results, so we page through and filter ourselves.
export async function fetchArbeitnow(cfg) {
  const jobs = [];
  const maxPages = cfg.maxPages ?? 5;
  for (let page = 1; page <= maxPages; page++) {
    const body = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    for (const j of body.data || []) {
      jobs.push({
        source: 'arbeitnow',
        sourceId: j.slug,
        title: j.title,
        company: j.company_name,
        location: j.location || '',
        url: j.url,
        description: stripHtml(j.description),
        postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
        remote: Boolean(j.remote),
        tags: [...(j.tags || []), ...(j.job_types || [])],
      });
    }
    if (!body.links?.next || !(body.data || []).length) break;
    await sleep(400);
  }
  return jobs;
}
