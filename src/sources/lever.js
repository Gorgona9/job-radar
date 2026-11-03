import { fetchJson, stripHtml } from '../util.js';

// Company career pages hosted on Lever: jobs.lever.co/<company>/...
export async function fetchLever(cfg) {
  const jobs = [], errors = [];
  for (const company of cfg.companies || []) {
    try {
      const list = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`);
      for (const j of list || []) {
        const lists = (j.lists || []).map((l) => `${l.text}\n${stripHtml(l.content)}`).join('\n\n');
        jobs.push({
          source: 'lever',
          sourceId: `${company}-${j.id}`,
          title: j.text,
          company,
          location: [j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean).join(', '),
          url: j.hostedUrl,
          description: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join('\n\n'),
          postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
          remote: j.workplaceType === 'remote' ? true : null,
          tags: [j.categories?.team, j.categories?.commitment].filter(Boolean),
        });
      }
    } catch (e) { errors.push(`lever/${company}: ${e.message}`); }
  }
  return { jobs, errors };
}
