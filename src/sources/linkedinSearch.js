import { stripHtml, sleep } from '../util.js';

// LinkedIn's logged-out ("guest") job search — the same pages anyone sees without an account.
// No login, so your LinkedIn account is never involved. LinkedIn's terms don't allow automated
// access, so this is kept gentle (few queries, pauses, details only for new developer titles) and
// it stops by itself if LinkedIn starts rate-limiting (HTTP 429 / 999).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BASE = 'https://www.linkedin.com/jobs-guest/jobs/api';

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } });
  if (res.status === 429 || res.status === 999) { const e = new Error(`LinkedIn rate limit (${res.status})`); e.stop = true; throw e; }
  if (!res.ok) throw new Error(`${res.status} for ${url.split('?')[0]}`);
  return res.text();
}

const pick = (html, cls) => stripHtml((html.match(new RegExp(`class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)</`, 'i')) || [])[1] || '');

function parseCards(html) {
  return html.split('<li').slice(1).map((li) => {
    const id = li.match(/urn:li:jobPosting:(\d+)/)?.[1];
    if (!id) return null;
    return {
      id,
      title: pick(li, 'base-search-card__title'),
      company: pick(li, 'base-search-card__subtitle'),
      location: pick(li, 'job-search-card__location'),
      postedAt: li.match(/datetime="([\d-]+)"/)?.[1] || null,
    };
  }).filter(Boolean);
}

function parseDetail(html) {
  const start = html.indexOf('description__text--rich');
  if (start < 0) return '';
  const rest = html.slice(html.indexOf('>', start) + 1);
  const end = rest.search(/show-more-less-html__button|<\/section>/);
  const criteria = [...html.matchAll(/description__job-criteria-subheader[^>]*>([\s\S]*?)<\/h3>[\s\S]*?description__job-criteria-text[^>]*>([\s\S]*?)<\/span>/g)]
    .map((m) => `${stripHtml(m[1])}: ${stripHtml(m[2])}`).join('\n');
  return [stripHtml(end > 0 ? rest.slice(0, end) : rest.slice(0, 20000)), criteria].filter(Boolean).join('\n\n');
}

// Search groups run in order, each with its own queries and its own budget of detail pages, so jobs
// abroad can't use up the budget meant for Armenia or remote. If LinkedIn rate-limits, everything stops.
// Older configs with plain `queries` / `locations` still work as one group.
export async function fetchLinkedinSearch(cfg, config) {
  const titleOk = new RegExp(config.titleMustMatch, 'i');
  const titleBad = new RegExp(config.titleExclude, 'i');
  const known = config._knownIds || new Set();
  const days = cfg.daysBack ?? 7;
  const groups = cfg.searches || [{ locations: cfg.locations || ['Germany'], queries: cfg.queries || ['java developer'], maxDetails: cfg.maxDetails, remoteOnly: cfg.remoteOnly }];
  const jobs = new Map(), errors = [];
  let stopped = false;

  for (const g of groups) {
    if (stopped) break;
    const mine = [];
    outer: for (const location of g.locations || ['Germany']) {
      for (const keywords of g.queries || cfg.queries || ['java developer']) {
        for (let page = 0; page < (g.pages ?? cfg.pages ?? 1); page++) {
          const qs = new URLSearchParams({ keywords, location, f_TPR: `r${days * 86400}`, start: String(page * 10) });
          // A plain "Armenia" means the city in Colombia to LinkedIn; geoIds pin a location to the right country.
          if (g.geoIds?.[location]) qs.set('geoId', g.geoIds[location]);
          if (g.remoteOnly || /remote|worldwide/i.test(location)) qs.set('f_WT', '2');
          let cards;
          try { cards = parseCards(await get(`${BASE}/seeMoreJobPostings/search?${qs}`)); }
          catch (e) { errors.push(`linkedin "${keywords}" in ${location}: ${e.message}`); if (e.stop) { stopped = true; break outer; } break; }
          for (const c of cards) {
            if (jobs.has(c.id)) continue;
            const remote = qs.has('f_WT') || /remote/i.test(c.location);
            const job = {
              source: 'linkedin', sourceId: c.id,
              title: c.title, company: c.company,
              // A remote search in "Armenia" means remote work from Armenia; say so in the location.
              location: remote && !/remote/i.test(c.location) ? `${c.location || location} (remote)` : c.location,
              url: `https://www.linkedin.com/jobs/view/${c.id}/`,
              description: '', postedAt: c.postedAt ? new Date(c.postedAt).toISOString() : null,
              remote: remote || null, tags: [`LinkedIn: ${keywords}`],
              shortDescription: true,
            };
            jobs.set(c.id, job);
            mine.push(job);
          }
          await sleep(cfg.delayMs ?? 2500);
          if (cards.length < 10) break;
        }
      }
    }
    // Full text only for new developer titles, capped per group.
    let details = 0;
    for (const job of mine) {
      if (stopped || details >= (g.maxDetails ?? 40)) break;
      if (known.has(`linkedin:${job.sourceId}`) || !titleOk.test(job.title) || titleBad.test(job.title)) continue;
      try {
        const desc = parseDetail(await get(`${BASE}/jobPosting/${job.sourceId}`));
        if (desc) { job.description = desc; job.shortDescription = false; }
        details++;
        await sleep(cfg.delayMs ?? 2500);
      } catch (e) { errors.push(`linkedin detail ${job.sourceId}: ${e.message}`); if (e.stop) stopped = true; }
    }
  }
  // Only hand over postings with full text, plus ones already stored (so they count as still online).
  // The rest are not developer roles or over this run's cap — they come back in later runs.
  return { jobs: [...jobs.values()].filter((j) => j.description || known.has(`linkedin:${j.sourceId}`)), errors };
}
