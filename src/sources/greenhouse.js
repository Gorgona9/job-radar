import { fetchJson, stripHtml } from '../util.js';

// Company career boards hosted on Greenhouse. Find a company's slug in its job links:
// boards.greenhouse.io/<slug>/jobs/...  or  job-boards.greenhouse.io/<slug>/...
export async function fetchGreenhouse(cfg) {
  const jobs = [], errors = [];
  for (const slug of cfg.boards || []) {
    try {
      const body = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`);
      for (const j of body.jobs || []) {
        jobs.push({
          source: 'greenhouse',
          sourceId: `${slug}-${j.id}`,
          title: j.title,
          company: j.company_name || slug,
          location: j.location?.name || '',
          url: j.absolute_url,
          // content is HTML that is itself entity-encoded, hence two passes
          description: stripHtml(stripHtml(j.content || '')),
          postedAt: j.first_published || j.updated_at || null,
          remote: null,
          tags: (j.departments || []).map((d) => d.name),
        });
      }
    } catch (e) { errors.push(`greenhouse/${slug}: ${e.message}`); }
  }
  return { jobs, errors };
}
