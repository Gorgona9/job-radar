import { fetchJson, stripHtml, sleep } from '../util.js';

// Company career pages on Ashby and SmartRecruiters (Greenhouse and Lever have their own files).

// Ashby: jobs.ashbyhq.com/<slug>
export async function fetchAshby(cfg) {
  const jobs = [], errors = [];
  for (const slug of cfg.boards || []) {
    try {
      const body = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`);
      for (const j of body.jobs || []) {
        if (j.isListed === false) continue;
        const locs = [j.location, ...(j.secondaryLocations || []).map((l) => l.location)].filter(Boolean);
        const country = j.address?.postalAddress?.addressCountry;
        jobs.push({
          source: 'ashby', sourceId: `${slug}-${j.id}`,
          title: j.title, company: body.organizationName || slug,
          location: [locs.join(' / '), country && !locs.join(' ').includes(country) ? country : null, j.workplaceType === 'Remote' ? 'Remote' : null].filter(Boolean).join(', '),
          url: j.jobUrl, description: j.descriptionPlain || stripHtml(j.descriptionHtml || ''),
          postedAt: j.publishedAt || null, remote: j.workplaceType === 'Remote' ? true : null,
          tags: [j.department, j.employmentType, j.workplaceType].filter(Boolean),
        });
      }
    } catch (e) { errors.push(`ashby/${slug}: ${e.message}`); }
  }
  return { jobs, errors };
}

// SmartRecruiters: the list has no descriptions, so we fetch details only for developer titles.
export async function fetchSmartRecruiters(cfg, config) {
  const jobs = [], errors = [];
  const titleOk = new RegExp(config.titleMustMatch, 'i');
  const titleBad = new RegExp(config.titleExclude, 'i');
  for (const company of cfg.companies || []) {
    try {
      const list = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=100&q=${encodeURIComponent(cfg.query || 'engineer')}`);
      for (const p of list.content || []) {
        if (!titleOk.test(p.name) || titleBad.test(p.name)) continue;
        let description = '';
        try {
          const d = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${p.id}`);
          description = Object.values(d.jobAd?.sections || {}).map((s) => `${s.title || ''}\n${stripHtml(s.text || '')}`).join('\n\n');
          await sleep(150);
        } catch { /* keep without description */ }
        jobs.push({
          source: 'smartrecruiters', sourceId: `${company}-${p.id}`,
          title: p.name, company: p.company?.name || company,
          location: [p.location?.fullLocation?.replace(/,\s*,/g, ','), p.location?.remote ? 'Remote' : null].filter(Boolean).join(', '),
          url: `https://jobs.smartrecruiters.com/${company}/${p.id}`,
          description, postedAt: p.releasedDate || null, remote: p.location?.remote || null,
          tags: [p.function?.label, p.experienceLevel?.label].filter(Boolean),
        });
      }
    } catch (e) { errors.push(`smartrecruiters/${company}: ${e.message}`); }
  }
  return { jobs, errors };
}
